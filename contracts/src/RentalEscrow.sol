// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

interface IAuthorizable {
    function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external;
    function revokeAuthorization(uint256 tokenId, address executor) external;
}

/// @title RentalEscrow — custody-based rental market for YapFighter (ERC-7857) tokens.
/// @notice Owners deposit their fighter into escrow with a price-per-day and a max duration;
///         any wallet can rent for N days by paying upfront. While rented, the escrow calls
///         `authorizeUsage` on YapFighter so the renter is recognized by the canonical
///         authorization mapping — no sidecar registry, no trust assumption on off-chain code.
/// @dev Pattern A (custody). The NFT sits in this contract between `listForRent` and
///      `cancelRentListing` / `reclaim`. Ownership drift is therefore impossible during a rental.
contract RentalEscrow is AccessControl, ReentrancyGuard, Pausable, IERC721Receiver {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint16 public constant MAX_FEE_BPS = 1000; // 10%
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_DURATION_DAYS = 365;
    uint256 public constant MAX_PAGE_SIZE = 100;

    /// @notice Dispute timing for the co-signed split lifecycle. After
    ///         expiresAt the renter has DISPUTE_ACCEPTANCE_PERIOD to
    ///         either accept the rental (release funds to owner) or
    ///         open a dispute. After DISPUTE_MAX_LIFETIME, anyone can
    ///         force-close: settle to owner if no dispute opened,
    ///         refund renter if disputed.
    uint256 public constant DISPUTE_ACCEPTANCE_PERIOD = 1 days;
    uint256 public constant DISPUTE_MAX_LIFETIME = 7 days;

    /// @notice Opaque permissions bytes forwarded to `YapFighter.authorizeUsage` during rent.
    ///         `0x01` = "battle only"; off-chain inference layer defines the semantics.
    bytes public rentalPermissions = hex"01";

    address public immutable fighterContract;
    address public treasury;
    uint16 public platformFeeBps = 250; // 2.5%

    struct RentListing {
        uint256 tokenId;
        address owner;
        uint256 pricePerDay;
        uint256 maxDurationDays;
        uint64 listedAt;
        bool active;
        /// @notice When true, rental funds are held in escrow until
        ///         the dispute window closes (co-signed split lifecycle).
        ///         Listings default to false for backwards compatibility
        ///         with the original instant-credit path.
        bool disputable;
    }

    struct ActiveRental {
        address renter;
        uint64 startedAt;
        uint64 expiresAt;
        uint256 paid;
    }

    /// @notice Dispute state for a disputable rental. Lives in its own
    ///         mapping so the existing ActiveRental layout / tests are
    ///         untouched. A status of 0 means "no dispute lifecycle"
    ///         (either non-disputable or token was never rented).
    /// @dev Status codes:
    ///        1 = Funded — funds escrowed, awaiting acceptance/dispute
    ///        2 = Disputed — renter contested within the 24h window
    ///        3 = Settled — funds released, terminal
    struct DisputeState {
        uint8 status;
        address renter;
        address owner;
        uint64 disputeWindowEnds; // expiresAt + DISPUTE_ACCEPTANCE_PERIOD
        uint64 maxLifetimeEnds;   // expiresAt + DISPUTE_MAX_LIFETIME
        uint256 escrowed;          // full rental cost incl. platform fee
        bytes32 ownerProposalHash; // keccak256(renterAmt, ownerAmt) or 0
        bytes32 renterProposalHash;
    }

    mapping(uint256 => RentListing) public rentListings;
    mapping(uint256 => ActiveRental) public activeRental;
    mapping(uint256 => DisputeState) public disputeOf;
    mapping(address => uint256) public sellerBalances;

    uint256[] public activeTokenIds;
    mapping(uint256 => uint256) private _tokenIdIndex; // 1-based

    event RentListed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 pricePerDay,
        uint256 maxDurationDays,
        bool disputable
    );
    event RentListingCancelled(uint256 indexed tokenId, address indexed owner);
    event Rented(
        uint256 indexed tokenId,
        address indexed renter,
        uint256 durationDays,
        uint256 paid,
        uint256 platformFee
    );
    event Reclaimed(uint256 indexed tokenId, address indexed owner);
    event WithdrewRent(address indexed owner, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint16 oldBps, uint16 newBps);
    event RentalPermissionsUpdated(bytes permissions);

    // Dispute lifecycle events
    event RentalAccepted(uint256 indexed tokenId, address indexed renter);
    event RentalDisputed(uint256 indexed tokenId, address indexed renter);
    event RentalSplitProposed(
        uint256 indexed tokenId,
        address indexed proposer,
        uint256 renterAmount,
        uint256 ownerAmount
    );
    event RentalSettled(
        uint256 indexed tokenId,
        uint256 renterPayout,
        uint256 ownerPayout,
        uint256 platformFee
    );
    event RentalForceClosed(uint256 indexed tokenId);

    error NotOwner();
    error ZeroPrice();
    error ZeroDuration();
    error DurationTooHigh();
    error DurationExceedsMax();
    error NotListed();
    error AlreadyListed();
    error AlreadyRented();
    error SelfRent();
    error InsufficientPayment();
    error NothingToWithdraw();
    error RefundFailed();
    error TransferFailed();
    error ActiveRentalExists();
    error RentalNotExpired();
    error ZeroAddress();
    error FeeTooHigh();
    error PageSizeTooLarge();
    error UnsupportedToken();
    // Dispute lifecycle errors
    error NotDisputable();
    error RentalStillLive();
    error AcceptanceWindowClosed();
    error AcceptanceWindowOpen();
    error AlreadySettled();
    error NotInDispute();
    error LifetimeNotReached();
    error InvalidSplit();
    error UnauthorizedParty();

    constructor(address fighter, address admin, address treasury_) {
        if (fighter == address(0) || admin == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        fighterContract = fighter;
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // --------------------------------------------------------------------------------------------
    // Listing lifecycle
    // --------------------------------------------------------------------------------------------

    function listForRent(uint256 tokenId, uint256 pricePerDay, uint256 maxDurationDays)
        external
        whenNotPaused
    {
        _listForRent(tokenId, pricePerDay, maxDurationDays, false);
    }

    /// @notice List a fighter for rent with co-signed dispute resolution.
    ///         Funds are held in escrow until the rental expires plus a
    ///         24h acceptance window; renter may dispute within that
    ///         window and parties co-sign a split, otherwise force-close
    ///         after 7d defaults to refunding the renter.
    function listForRentDisputable(
        uint256 tokenId,
        uint256 pricePerDay,
        uint256 maxDurationDays
    ) external whenNotPaused {
        _listForRent(tokenId, pricePerDay, maxDurationDays, true);
    }

    function _listForRent(
        uint256 tokenId,
        uint256 pricePerDay,
        uint256 maxDurationDays,
        bool disputable
    ) internal {
        if (pricePerDay == 0) revert ZeroPrice();
        if (maxDurationDays == 0) revert ZeroDuration();
        if (maxDurationDays > MAX_DURATION_DAYS) revert DurationTooHigh();
        if (rentListings[tokenId].active) revert AlreadyListed();

        IERC721 nft = IERC721(fighterContract);
        if (nft.ownerOf(tokenId) != msg.sender) revert NotOwner();

        RentListing storage l = rentListings[tokenId];
        l.tokenId = tokenId;
        l.owner = msg.sender;
        l.pricePerDay = pricePerDay;
        l.maxDurationDays = maxDurationDays;
        l.listedAt = uint64(block.timestamp);
        l.active = true;
        l.disputable = disputable;

        activeTokenIds.push(tokenId);
        _tokenIdIndex[tokenId] = activeTokenIds.length;

        emit RentListed(tokenId, msg.sender, pricePerDay, maxDurationDays, disputable);

        // Pull NFT into escrow. YapFighter._update will clear any pre-existing authorizations.
        nft.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    function cancelRentListing(uint256 tokenId) external {
        RentListing storage l = rentListings[tokenId];
        if (!l.active) revert NotListed();
        if (l.owner != msg.sender) revert NotOwner();
        if (_isRentalActive(tokenId)) revert ActiveRentalExists();

        _closeListing(tokenId, l.owner);
        emit RentListingCancelled(tokenId, msg.sender);
    }

    function reclaim(uint256 tokenId) external {
        RentListing storage l = rentListings[tokenId];
        if (!l.active) revert NotListed();
        ActiveRental storage r = activeRental[tokenId];
        if (r.renter == address(0)) revert RentalNotExpired();
        if (r.expiresAt > block.timestamp) revert RentalNotExpired();

        address listingOwner = l.owner;
        _closeListing(tokenId, listingOwner);
        emit Reclaimed(tokenId, listingOwner);
    }

    // --------------------------------------------------------------------------------------------
    // Rent
    // --------------------------------------------------------------------------------------------

    function rent(uint256 tokenId, uint256 durationDays)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        if (durationDays == 0) revert ZeroDuration();
        RentListing storage l = rentListings[tokenId];
        if (!l.active) revert NotListed();
        if (l.owner == msg.sender) revert SelfRent();
        if (durationDays > l.maxDurationDays) revert DurationExceedsMax();
        if (_isRentalActive(tokenId)) revert AlreadyRented();

        uint256 cost = l.pricePerDay * durationDays;
        if (msg.value < cost) revert InsufficientPayment();

        uint256 fee = (cost * platformFeeBps) / BPS_DENOMINATOR;
        uint256 ownerAmt = cost - fee;
        uint256 refund = msg.value - cost;

        // Disputable rentals hold the previous dispute's escrowed funds
        // until that lifecycle settles. We block re-rent over an unsettled
        // dispute so funds don't get conflated.
        if (l.disputable) {
            uint8 prevStatus = disputeOf[tokenId].status;
            if (prevStatus == 1 || prevStatus == 2) {
                revert AlreadyRented();
            }
        }

        // Revoke any prior (expired) renter's authorization so we don't accumulate executors.
        ActiveRental storage prior = activeRental[tokenId];
        address priorRenter = prior.renter;

        // --- effects ---
        uint64 expiresAt = uint64(block.timestamp + durationDays * 1 days);
        activeRental[tokenId] = ActiveRental({
            renter: msg.sender,
            startedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            paid: cost
        });
        if (l.disputable) {
            // Hold the FULL cost (incl. fee) in dispute escrow. Fee is
            // taken only at settlement to owner — refunds return everything.
            disputeOf[tokenId] = DisputeState({
                status: 1, // Funded
                renter: msg.sender,
                owner: l.owner,
                disputeWindowEnds: expiresAt + uint64(DISPUTE_ACCEPTANCE_PERIOD),
                maxLifetimeEnds: expiresAt + uint64(DISPUTE_MAX_LIFETIME),
                escrowed: cost,
                ownerProposalHash: bytes32(0),
                renterProposalHash: bytes32(0)
            });
        } else {
            sellerBalances[l.owner] += ownerAmt;
            if (fee > 0) {
                sellerBalances[treasury] += fee;
            }
        }

        // --- interactions ---
        if (priorRenter != address(0) && priorRenter != msg.sender) {
            try IAuthorizable(fighterContract).revokeAuthorization(tokenId, priorRenter) {} catch {}
        }
        IAuthorizable(fighterContract).authorizeUsage(tokenId, msg.sender, rentalPermissions);

        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit Rented(tokenId, msg.sender, durationDays, cost, fee);
    }

    // --------------------------------------------------------------------------------------------
    // Dispute lifecycle — co-signed split
    //
    // Only used for listings created via `listForRentDisputable`. Funds
    // sit in `disputeOf[tokenId].escrowed` until acceptance, timeout,
    // co-signed split, or 7d force-close. Platform fee is taken only on
    // settlement to owner — refunds return everything to the renter so
    // the platform never profits from a dispute.
    // --------------------------------------------------------------------------------------------

    /// @notice Renter explicitly accepts the rental and releases the
    ///         escrowed funds to the owner (minus platform fee). Callable
    ///         only after `expiresAt` and only by the original renter.
    function acceptRental(uint256 tokenId) external nonReentrant {
        DisputeState storage d = disputeOf[tokenId];
        if (d.status != 1) revert AlreadySettled();
        if (msg.sender != d.renter) revert UnauthorizedParty();
        if (block.timestamp < activeRental[tokenId].expiresAt) revert RentalStillLive();
        _settleToOwner(tokenId, d);
        emit RentalAccepted(tokenId, msg.sender);
    }

    /// @notice Renter contests the rental within the 24h acceptance
    ///         window. Funds remain escrowed until co-signed split or
    ///         7d force-close (defaults to renter refund).
    function disputeRental(uint256 tokenId) external {
        DisputeState storage d = disputeOf[tokenId];
        if (d.status != 1) revert AlreadySettled();
        if (msg.sender != d.renter) revert UnauthorizedParty();
        uint64 expiresAt = activeRental[tokenId].expiresAt;
        if (block.timestamp < expiresAt) revert RentalStillLive();
        if (block.timestamp >= d.disputeWindowEnds) revert AcceptanceWindowClosed();
        d.status = 2;
        emit RentalDisputed(tokenId, msg.sender);
    }

    /// @notice Anyone can release escrowed funds to the owner once the
    ///         24h acceptance window passes without a dispute being
    ///         opened. Permissionless so neither party can grief by
    ///         going silent.
    function claimRentalTimeout(uint256 tokenId) external nonReentrant {
        DisputeState storage d = disputeOf[tokenId];
        if (d.status != 1) revert AlreadySettled();
        if (block.timestamp < d.disputeWindowEnds) revert AcceptanceWindowOpen();
        _settleToOwner(tokenId, d);
    }

    /// @notice In-dispute, either party proposes a (renterAmt, ownerAmt)
    ///         split that must sum to the escrowed amount. When both
    ///         parties have proposed identical hashes the contract
    ///         auto-settles using the latest proposer's amounts. Last
    ///         write wins — re-proposing replaces the prior hash.
    function proposeRentalSplit(
        uint256 tokenId,
        uint256 renterAmount,
        uint256 ownerAmount
    ) external nonReentrant {
        DisputeState storage d = disputeOf[tokenId];
        if (d.status != 2) revert NotInDispute();
        if (msg.sender != d.renter && msg.sender != d.owner) {
            revert UnauthorizedParty();
        }
        if (renterAmount + ownerAmount != d.escrowed) revert InvalidSplit();

        bytes32 h = keccak256(abi.encode(renterAmount, ownerAmount));
        if (msg.sender == d.renter) {
            d.renterProposalHash = h;
        } else {
            d.ownerProposalHash = h;
        }
        emit RentalSplitProposed(tokenId, msg.sender, renterAmount, ownerAmount);

        if (
            d.renterProposalHash != bytes32(0) &&
            d.renterProposalHash == d.ownerProposalHash
        ) {
            _settleSplit(tokenId, d, renterAmount, ownerAmount);
        }
    }

    /// @notice Anyone can force-close after the 7d max lifetime. If the
    ///         lifecycle ended in dispute (status == 2) the renter is
    ///         refunded in full; if no dispute was opened (status == 1)
    ///         funds settle to the owner per the timeout default.
    function forceCloseRental(uint256 tokenId) external nonReentrant {
        DisputeState storage d = disputeOf[tokenId];
        uint8 s = d.status;
        if (s != 1 && s != 2) revert AlreadySettled();
        if (block.timestamp < d.maxLifetimeEnds) revert LifetimeNotReached();
        if (s == 2) {
            _refundRenter(tokenId, d);
        } else {
            _settleToOwner(tokenId, d);
        }
        emit RentalForceClosed(tokenId);
    }

    function _settleToOwner(uint256 tokenId, DisputeState storage d) internal {
        uint256 escrowed = d.escrowed;
        uint256 fee = (escrowed * platformFeeBps) / BPS_DENOMINATOR;
        uint256 ownerAmt = escrowed - fee;
        d.status = 3;
        d.escrowed = 0;
        sellerBalances[d.owner] += ownerAmt;
        if (fee > 0) {
            sellerBalances[treasury] += fee;
        }
        emit RentalSettled(tokenId, 0, ownerAmt, fee);
    }

    function _refundRenter(uint256 tokenId, DisputeState storage d) internal {
        uint256 escrowed = d.escrowed;
        d.status = 3;
        d.escrowed = 0;
        // Credit via sellerBalances so renter pulls funds with the same
        // withdrawProceeds() flow everyone else uses — keeps the contract
        // free of direct ether transfers in the lifecycle path.
        sellerBalances[d.renter] += escrowed;
        emit RentalSettled(tokenId, escrowed, 0, 0);
    }

    function _settleSplit(
        uint256 tokenId,
        DisputeState storage d,
        uint256 renterAmount,
        uint256 ownerAmount
    ) internal {
        // Platform fee is proportional to the owner's share so a 100%
        // refund to renter takes no fee, and a 100% award to owner takes
        // the full fee. Splits in between scale linearly.
        uint256 fee = (ownerAmount * platformFeeBps) / BPS_DENOMINATOR;
        uint256 ownerNet = ownerAmount - fee;
        d.status = 3;
        d.escrowed = 0;
        if (renterAmount > 0) sellerBalances[d.renter] += renterAmount;
        if (ownerNet > 0) sellerBalances[d.owner] += ownerNet;
        if (fee > 0) sellerBalances[treasury] += fee;
        emit RentalSettled(tokenId, renterAmount, ownerNet, fee);
    }

    function getDispute(uint256 tokenId) external view returns (DisputeState memory) {
        return disputeOf[tokenId];
    }

    // --------------------------------------------------------------------------------------------
    // Withdraw (pull)
    // --------------------------------------------------------------------------------------------

    function withdrawProceeds() external nonReentrant {
        uint256 amount = sellerBalances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        sellerBalances[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit WithdrewRent(msg.sender, amount);
    }

    function sellerProceeds(address seller) external view returns (uint256) {
        return sellerBalances[seller];
    }

    // --------------------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------------------

    function getRentListing(uint256 tokenId) external view returns (RentListing memory) {
        return rentListings[tokenId];
    }

    function getActiveRental(uint256 tokenId) external view returns (ActiveRental memory) {
        return activeRental[tokenId];
    }

    function isActiveRental(uint256 tokenId) external view returns (bool) {
        return _isRentalActive(tokenId);
    }

    /// @notice Returns the address that should be treated as the fighter's active user.
    /// @dev Active renter during the rental window; otherwise the listing owner (while the NFT
    ///      is escrowed); otherwise the current on-chain owner.
    function effectiveUser(uint256 tokenId) external view returns (address) {
        ActiveRental storage r = activeRental[tokenId];
        if (r.renter != address(0) && r.expiresAt > block.timestamp) {
            return r.renter;
        }
        RentListing storage l = rentListings[tokenId];
        if (l.active) return l.owner;
        try IERC721(fighterContract).ownerOf(tokenId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function activeListingsCount() external view returns (uint256) {
        return activeTokenIds.length;
    }

    function activeRentals(uint256 offset, uint256 limit)
        external
        view
        returns (RentListing[] memory page)
    {
        if (limit > MAX_PAGE_SIZE) revert PageSizeTooLarge();
        uint256 total = activeTokenIds.length;
        if (offset >= total) return new RentListing[](0);
        uint256 remaining = total - offset;
        uint256 n = limit < remaining ? limit : remaining;
        page = new RentListing[](n);
        for (uint256 i = 0; i < n; ++i) {
            page[i] = rentListings[activeTokenIds[offset + i]];
        }
    }

    // --------------------------------------------------------------------------------------------
    // Admin
    // --------------------------------------------------------------------------------------------

    function setPlatformFeeBps(uint16 newBps) external onlyRole(ADMIN_ROLE) {
        if (newBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint16 old = platformFeeBps;
        platformFeeBps = newBps;
        emit PlatformFeeUpdated(old, newBps);
    }

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setRentalPermissions(bytes calldata permissions) external onlyRole(ADMIN_ROLE) {
        rentalPermissions = permissions;
        emit RentalPermissionsUpdated(permissions);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // --------------------------------------------------------------------------------------------
    // ERC721 receiver (accept only YapFighter)
    // --------------------------------------------------------------------------------------------

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != fighterContract) revert UnsupportedToken();
        return this.onERC721Received.selector;
    }

    // --------------------------------------------------------------------------------------------
    // Internals
    // --------------------------------------------------------------------------------------------

    function _isRentalActive(uint256 tokenId) internal view returns (bool) {
        ActiveRental storage r = activeRental[tokenId];
        return r.renter != address(0) && r.expiresAt > block.timestamp;
    }

    function _closeListing(uint256 tokenId, address to) internal {
        // Revoke any residual rental authorization before returning the NFT. _update will also
        // clear authorizations on the subsequent transfer, but we explicitly revoke so the event
        // log reflects intent and the executor cap stays clean.
        ActiveRental storage r = activeRental[tokenId];
        if (r.renter != address(0)) {
            try IAuthorizable(fighterContract).revokeAuthorization(tokenId, r.renter) {} catch {}
            delete activeRental[tokenId];
        }

        rentListings[tokenId].active = false;
        _removeActiveId(tokenId);

        IERC721(fighterContract).safeTransferFrom(address(this), to, tokenId);
    }

    function _removeActiveId(uint256 tokenId) internal {
        uint256 idx1 = _tokenIdIndex[tokenId];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 lastIdx = activeTokenIds.length - 1;
        if (idx != lastIdx) {
            uint256 lastId = activeTokenIds[lastIdx];
            activeTokenIds[idx] = lastId;
            _tokenIdIndex[lastId] = idx1;
        }
        activeTokenIds.pop();
        delete _tokenIdIndex[tokenId];
    }
}
