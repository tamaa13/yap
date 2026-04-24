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
    }

    struct ActiveRental {
        address renter;
        uint64 startedAt;
        uint64 expiresAt;
        uint256 paid;
    }

    mapping(uint256 => RentListing) public rentListings;
    mapping(uint256 => ActiveRental) public activeRental;
    mapping(address => uint256) public sellerBalances;

    uint256[] public activeTokenIds;
    mapping(uint256 => uint256) private _tokenIdIndex; // 1-based

    event RentListed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 pricePerDay,
        uint256 maxDurationDays
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

        activeTokenIds.push(tokenId);
        _tokenIdIndex[tokenId] = activeTokenIds.length;

        emit RentListed(tokenId, msg.sender, pricePerDay, maxDurationDays);

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

        // Revoke any prior (expired) renter's authorization so we don't accumulate executors.
        ActiveRental storage prior = activeRental[tokenId];
        address priorRenter = prior.renter;

        // --- effects ---
        activeRental[tokenId] = ActiveRental({
            renter: msg.sender,
            startedAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + durationDays * 1 days),
            paid: cost
        });
        sellerBalances[l.owner] += ownerAmt;
        if (fee > 0) {
            sellerBalances[treasury] += fee;
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
