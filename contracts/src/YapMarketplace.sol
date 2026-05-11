// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// @title YapMarketplace — secondary market for YapFighter (ERC-721 / ERC-7857) tokens.
/// @notice Pull-payment escrow: buyers pay in native OG, sellers withdraw proceeds, treasury
///         accumulates platform fees and withdraws via the same pull mechanism.
/// @dev All state changes follow check-effects-interactions. `activeTokenIds` uses a swap-pop
///      index so listing removal stays O(1).
contract YapMarketplace is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint16 public constant MAX_FEE_BPS = 1000; // 10%
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PAGE_SIZE = 100;

    address public immutable fighterContract;
    address public treasury;
    uint16 public platformFeeBps = 250; // 2.5%

    struct Listing {
        uint256 tokenId;
        address seller;
        uint256 price;
        uint64 listedAt;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public sellerBalances;

    uint256[] public activeTokenIds;
    mapping(uint256 => uint256) private _tokenIdIndex; // 1-based index into activeTokenIds

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event PriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
    event Sold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 platformFee
    );
    /// @notice Emitted when a sale routed an EIP-2981 royalty to the
    ///         underlying NFT's creator. Marketplaces holding NFTs that
    ///         don't implement EIP-2981 (e.g. plain YapFighter) never fire
    ///         this event — the royalty staticcall just falls through.
    event RoyaltyPaid(
        uint256 indexed tokenId,
        address indexed receiver,
        uint256 amount
    );
    event Withdrew(address indexed seller, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint16 oldBps, uint16 newBps);

    error NotOwner();
    error NotApproved();
    error AlreadyListed();
    error NotListed();
    error NotSeller();
    error SelfBuy();
    error InsufficientPayment();
    error ZeroPrice();
    error ZeroAddress();
    error FeeTooHigh();
    error NothingToWithdraw();
    error RefundFailed();
    error TransferFailed();
    error PageSizeTooLarge();

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
    // Listings
    // --------------------------------------------------------------------------------------------

    function listItem(uint256 tokenId, uint256 price) external whenNotPaused {
        if (price == 0) revert ZeroPrice();
        IERC721 nft = IERC721(fighterContract);
        address owner = nft.ownerOf(tokenId);
        if (owner != msg.sender) revert NotOwner();
        if (
            nft.getApproved(tokenId) != address(this) &&
            !nft.isApprovedForAll(owner, address(this))
        ) {
            revert NotApproved();
        }
        Listing storage l = listings[tokenId];
        if (l.active) revert AlreadyListed();

        l.tokenId = tokenId;
        l.seller = msg.sender;
        l.price = price;
        l.listedAt = uint64(block.timestamp);
        l.active = true;

        activeTokenIds.push(tokenId);
        _tokenIdIndex[tokenId] = activeTokenIds.length;

        emit Listed(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();

        _removeListing(tokenId);
        emit Cancelled(tokenId, msg.sender);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        if (newPrice == 0) revert ZeroPrice();
        Listing storage l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();

        uint256 old = l.price;
        l.price = newPrice;
        emit PriceUpdated(tokenId, old, newPrice);
    }

    // --------------------------------------------------------------------------------------------
    // Buy
    // --------------------------------------------------------------------------------------------

    function buyItem(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (l.seller == msg.sender) revert SelfBuy();
        if (msg.value < l.price) revert InsufficientPayment();

        uint256 fee = (l.price * platformFeeBps) / BPS_DENOMINATOR;
        // Probe EIP-2981 on the underlying NFT. Result is zero/zero for
        // plain ERC-721 collections (e.g. YapFighter) so this instance of
        // the marketplace is backwards-compatible with the fighter market.
        (address royaltyReceiver, uint256 royaltyAmt) =
            _royaltyOf(tokenId, l.price);
        // Cap royalty so the seller can't end up underwater after fee + royalty
        // exceed price. A misconfigured high bps just truncates to the remaining
        // proceeds rather than reverting the whole sale.
        uint256 sellerPayable = l.price - fee;
        if (royaltyAmt > sellerPayable) royaltyAmt = sellerPayable;
        // Self-royalty (receiver == seller) is folded back into the seller's
        // balance — there's no double-credit, the merge skips the event since
        // no economic transfer happened.
        if (royaltyReceiver == l.seller) royaltyAmt = 0;
        uint256 sellerAmt = sellerPayable - royaltyAmt;
        uint256 refund = msg.value - l.price;

        // --- effects first ---
        _removeListing(tokenId);
        sellerBalances[l.seller] += sellerAmt;
        if (fee > 0) {
            // Credit treasury into pull balance; treasury withdraws via withdrawProceeds().
            sellerBalances[treasury] += fee;
        }
        if (royaltyAmt > 0 && royaltyReceiver != address(0)) {
            sellerBalances[royaltyReceiver] += royaltyAmt;
        }

        // --- interactions ---
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        // NFT transfer last — reverts whole tx if seller revoked approval or no longer owner.
        IERC721(fighterContract).safeTransferFrom(l.seller, msg.sender, tokenId);

        emit Sold(tokenId, l.seller, msg.sender, l.price, fee);
        if (royaltyAmt > 0 && royaltyReceiver != address(0)) {
            emit RoyaltyPaid(tokenId, royaltyReceiver, royaltyAmt);
        }
    }

    /// @dev EIP-2981 probe — returns the receiver/amount the NFT contract
    ///      reports for a sale at `price`. Non-EIP-2981 NFTs (no royaltyInfo
    ///      function, reverting implementations, or undersized returndata)
    ///      degrade to (address(0), 0). Low-level staticcall bypasses
    ///      Solidity's extcodesize auto-check so a misconfigured fighter
    ///      contract address doesn't bork the whole sale path.
    function _royaltyOf(uint256 tokenId, uint256 price)
        internal
        view
        returns (address receiver, uint256 amount)
    {
        (bool ok, bytes memory ret) = fighterContract.staticcall(
            abi.encodeWithSignature("royaltyInfo(uint256,uint256)", tokenId, price)
        );
        if (ok && ret.length >= 64) {
            (receiver, amount) = abi.decode(ret, (address, uint256));
        }
    }

    // --------------------------------------------------------------------------------------------
    // Pull payments
    // --------------------------------------------------------------------------------------------

    function withdrawProceeds() external nonReentrant {
        uint256 amount = sellerBalances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        sellerBalances[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrew(msg.sender, amount);
    }

    function sellerProceeds(address seller) external view returns (uint256) {
        return sellerBalances[seller];
    }

    // --------------------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------------------

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    function isListed(uint256 tokenId) external view returns (bool) {
        Listing storage l = listings[tokenId];
        if (!l.active) return false;
        // Treat as delisted if ownership drifted out of the seller (e.g., an off-market transfer).
        try IERC721(fighterContract).ownerOf(tokenId) returns (address currentOwner) {
            return currentOwner == l.seller;
        } catch {
            return false;
        }
    }

    function activeListingsCount() external view returns (uint256) {
        return activeTokenIds.length;
    }

    function activeListings(uint256 offset, uint256 limit)
        external
        view
        returns (Listing[] memory page)
    {
        if (limit > MAX_PAGE_SIZE) revert PageSizeTooLarge();
        uint256 total = activeTokenIds.length;
        if (offset >= total) return new Listing[](0);
        uint256 remaining = total - offset;
        uint256 n = limit < remaining ? limit : remaining;
        page = new Listing[](n);
        for (uint256 i = 0; i < n; ++i) {
            page[i] = listings[activeTokenIds[offset + i]];
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

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // --------------------------------------------------------------------------------------------
    // Internals
    // --------------------------------------------------------------------------------------------

    function _removeListing(uint256 tokenId) internal {
        listings[tokenId].active = false;

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
