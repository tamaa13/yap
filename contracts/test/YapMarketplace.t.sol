// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";
import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

contract MockFighter is ERC721 {
    constructor() ERC721("MockFighter", "MF") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

/// @dev Malicious buyer that re-enters buyItem from the ERC-721 receive hook.
contract ReentrantBuyer is IERC721Receiver {
    YapMarketplace public immutable mkt;
    uint256 public targetId;
    bool public reentered;

    constructor(YapMarketplace m) {
        mkt = m;
    }

    receive() external payable {}

    function buy(uint256 id) external payable {
        targetId = id;
        mkt.buyItem{value: msg.value}(id);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (!reentered) {
            reentered = true;
            // Must revert — marketplace is nonReentrant.
            try mkt.buyItem{value: 0}(targetId) {} catch {}
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Seller contract whose fallback re-enters withdrawProceeds; balance must stay safe.
contract ReentrantSeller {
    YapMarketplace public immutable mkt;
    MockFighter public immutable fighter;
    bool public reentered;
    uint256 public received;

    constructor(YapMarketplace m, MockFighter f) {
        mkt = m;
        fighter = f;
    }

    function approveAndList(uint256 tokenId, uint256 price) external {
        fighter.approve(address(mkt), tokenId);
        mkt.listItem(tokenId, price);
    }

    function withdraw() external {
        mkt.withdrawProceeds();
    }

    receive() external payable {
        received += msg.value;
        if (!reentered) {
            reentered = true;
            try mkt.withdrawProceeds() {} catch {}
        }
    }
}

contract YapMarketplaceTest is Test {
    YapMarketplace internal mkt;
    MockFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice"); // seller
    address internal bob = makeAddr("bob"); // buyer
    address internal carol = makeAddr("carol");

    uint256 internal constant TOKEN = 1;
    uint256 internal constant PRICE = 1 ether;

    function setUp() public {
        fighter = new MockFighter();
        mkt = new YapMarketplace(address(fighter), admin, treasury);
        fighter.mint(alice, TOKEN);
        fighter.mint(alice, 2);
        fighter.mint(alice, 3);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _listTokenByAlice(uint256 tokenId, uint256 price) internal {
        vm.prank(alice);
        fighter.approve(address(mkt), tokenId);
        vm.prank(alice);
        mkt.listItem(tokenId, price);
    }

    // ---------------- listItem ----------------

    function test_ListItem_happyPath() public {
        _listTokenByAlice(TOKEN, PRICE);
        YapMarketplace.Listing memory l = mkt.getListing(TOKEN);
        assertEq(l.seller, alice);
        assertEq(l.price, PRICE);
        assertTrue(l.active);
        assertTrue(mkt.isListed(TOKEN));
        assertEq(mkt.activeListingsCount(), 1);
    }

    function test_ListItem_RevertIfNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(YapMarketplace.NotOwner.selector);
        mkt.listItem(TOKEN, PRICE);
    }

    function test_ListItem_RevertIfNotApproved() public {
        vm.prank(alice);
        vm.expectRevert(YapMarketplace.NotApproved.selector);
        mkt.listItem(TOKEN, PRICE);
    }

    function test_ListItem_RevertIfAlreadyListed() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(alice);
        vm.expectRevert(YapMarketplace.AlreadyListed.selector);
        mkt.listItem(TOKEN, PRICE);
    }

    function test_ListItem_AcceptsApprovalForAll() public {
        vm.prank(alice);
        fighter.setApprovalForAll(address(mkt), true);
        vm.prank(alice);
        mkt.listItem(TOKEN, PRICE);
        assertTrue(mkt.isListed(TOKEN));
    }

    // ---------------- buyItem ----------------

    function test_BuyItem_happyPath() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        mkt.buyItem{value: PRICE}(TOKEN);

        assertEq(fighter.ownerOf(TOKEN), bob);
        // 2.5% → treasury, 97.5% → seller, both via pull balance.
        uint256 fee = (PRICE * 250) / 10_000;
        assertEq(mkt.sellerProceeds(alice), PRICE - fee);
        assertEq(mkt.sellerProceeds(treasury), fee);
        assertFalse(mkt.isListed(TOKEN));
        assertEq(mkt.activeListingsCount(), 0);
    }

    function test_BuyItem_RefundsExcess() public {
        _listTokenByAlice(TOKEN, PRICE);
        uint256 overpay = PRICE + 0.5 ether;
        uint256 before_ = bob.balance;
        vm.prank(bob);
        mkt.buyItem{value: overpay}(TOKEN);
        assertEq(before_ - bob.balance, PRICE);
    }

    function test_BuyItem_PlatformFee() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        mkt.buyItem{value: PRICE}(TOKEN);
        uint256 fee = (PRICE * 250) / 10_000;
        assertEq(mkt.sellerProceeds(treasury), fee);
        // Admin can change fee and it applies to subsequent sales.
        vm.prank(admin);
        mkt.setPlatformFeeBps(500);
        assertEq(mkt.platformFeeBps(), 500);
    }

    function test_BuyItem_RevertIfSelfBuy() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert(YapMarketplace.SelfBuy.selector);
        mkt.buyItem{value: PRICE}(TOKEN);
    }

    function test_BuyItem_RevertIfInsufficientPayment() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        vm.expectRevert(YapMarketplace.InsufficientPayment.selector);
        mkt.buyItem{value: PRICE - 1}(TOKEN);
    }

    function test_BuyItem_RevertIfNotListed() public {
        vm.prank(bob);
        vm.expectRevert(YapMarketplace.NotListed.selector);
        mkt.buyItem{value: PRICE}(TOKEN);
    }

    // ---------------- cancelListing ----------------

    function test_CancelListing_happyPath() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(alice);
        mkt.cancelListing(TOKEN);
        assertFalse(mkt.isListed(TOKEN));
        assertEq(mkt.activeListingsCount(), 0);
    }

    function test_CancelListing_RevertIfNotSeller() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        vm.expectRevert(YapMarketplace.NotSeller.selector);
        mkt.cancelListing(TOKEN);
    }

    // ---------------- updatePrice ----------------

    function test_UpdatePrice_happyPath() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(alice);
        mkt.updatePrice(TOKEN, 2 ether);
        assertEq(mkt.getListing(TOKEN).price, 2 ether);
    }

    function test_UpdatePrice_RevertIfNotSeller() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        vm.expectRevert(YapMarketplace.NotSeller.selector);
        mkt.updatePrice(TOKEN, 2 ether);
    }

    // ---------------- withdrawProceeds ----------------

    function test_WithdrawProceeds_happyPath() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        mkt.buyItem{value: PRICE}(TOKEN);

        uint256 expected = PRICE - (PRICE * 250) / 10_000;
        uint256 before_ = alice.balance;
        vm.prank(alice);
        mkt.withdrawProceeds();
        assertEq(alice.balance - before_, expected);
        assertEq(mkt.sellerProceeds(alice), 0);
    }

    function test_WithdrawProceeds_AfterMultipleSales() public {
        _listTokenByAlice(TOKEN, PRICE);
        _listTokenByAlice(2, 2 ether);

        vm.prank(bob);
        mkt.buyItem{value: PRICE}(TOKEN);
        vm.prank(carol);
        mkt.buyItem{value: 2 ether}(2);

        uint256 fee1 = (PRICE * 250) / 10_000;
        uint256 fee2 = (2 ether * 250) / 10_000;
        uint256 expected = (PRICE - fee1) + (2 ether - fee2);
        assertEq(mkt.sellerProceeds(alice), expected);

        uint256 before_ = alice.balance;
        vm.prank(alice);
        mkt.withdrawProceeds();
        assertEq(alice.balance - before_, expected);
    }

    function test_WithdrawProceeds_RevertIfEmpty() public {
        vm.prank(alice);
        vm.expectRevert(YapMarketplace.NothingToWithdraw.selector);
        mkt.withdrawProceeds();
    }

    function test_Treasury_WithdrawsAccruedFees() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(bob);
        mkt.buyItem{value: PRICE}(TOKEN);
        uint256 fee = (PRICE * 250) / 10_000;
        uint256 before_ = treasury.balance;
        vm.prank(treasury);
        mkt.withdrawProceeds();
        assertEq(treasury.balance - before_, fee);
    }

    // ---------------- reentrancy ----------------

    function test_Reentrancy_buyItem() public {
        _listTokenByAlice(TOKEN, PRICE);
        ReentrantBuyer attacker = new ReentrantBuyer(mkt);
        vm.deal(address(attacker), 5 ether);
        attacker.buy{value: PRICE}(TOKEN);
        // Outer buy should succeed; inner re-entry must have caught a revert.
        assertTrue(attacker.reentered());
        assertEq(fighter.ownerOf(TOKEN), address(attacker));
        assertEq(mkt.sellerProceeds(alice), PRICE - (PRICE * 250) / 10_000);
    }

    function test_Reentrancy_withdraw() public {
        ReentrantSeller seller = new ReentrantSeller(mkt, fighter);
        fighter.mint(address(seller), 999);
        seller.approveAndList(999, PRICE);

        vm.prank(bob);
        mkt.buyItem{value: PRICE}(999);

        uint256 expected = PRICE - (PRICE * 250) / 10_000;
        seller.withdraw();
        assertTrue(seller.reentered());
        // Total received stays 1x — re-entry attempt did not double-pay.
        assertEq(seller.received(), expected);
        assertEq(mkt.sellerProceeds(address(seller)), 0);
    }

    // ---------------- pause ----------------

    function test_Pause_BlocksListing() public {
        vm.prank(admin);
        mkt.pause();
        vm.prank(alice);
        fighter.approve(address(mkt), TOKEN);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mkt.listItem(TOKEN, PRICE);

        vm.prank(admin);
        mkt.unpause();
        vm.prank(alice);
        mkt.listItem(TOKEN, PRICE);
        assertTrue(mkt.isListed(TOKEN));
    }

    function test_Pause_BlocksBuy() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(admin);
        mkt.pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mkt.buyItem{value: PRICE}(TOKEN);
    }

    // ---------------- activeListings pagination ----------------

    function test_ActiveListings_Pagination() public {
        _listTokenByAlice(TOKEN, PRICE);
        _listTokenByAlice(2, 2 ether);
        _listTokenByAlice(3, 3 ether);

        YapMarketplace.Listing[] memory p1 = mkt.activeListings(0, 2);
        YapMarketplace.Listing[] memory p2 = mkt.activeListings(2, 2);
        YapMarketplace.Listing[] memory p3 = mkt.activeListings(5, 2);

        assertEq(p1.length, 2);
        assertEq(p2.length, 1);
        assertEq(p3.length, 0);
        assertEq(p1[0].tokenId, TOKEN);
        assertEq(p2[0].tokenId, 3);

        vm.expectRevert(YapMarketplace.PageSizeTooLarge.selector);
        mkt.activeListings(0, 101);
    }

    function test_ActiveListings_SwapPopOnCancel() public {
        _listTokenByAlice(TOKEN, PRICE);
        _listTokenByAlice(2, 2 ether);
        _listTokenByAlice(3, 3 ether);

        // cancel middle listing, confirm index parity
        vm.prank(alice);
        mkt.cancelListing(2);
        assertEq(mkt.activeListingsCount(), 2);
        YapMarketplace.Listing[] memory all_ = mkt.activeListings(0, 10);
        // order after swap-pop: [1, 3]
        assertEq(all_[0].tokenId, TOKEN);
        assertEq(all_[1].tokenId, 3);
    }

    // ---------------- approval revoked ----------------

    function test_SellerRevokedApproval_BuyReverts() public {
        _listTokenByAlice(TOKEN, PRICE);
        vm.prank(alice);
        fighter.approve(address(0), TOKEN); // revoke
        vm.prank(bob);
        vm.expectRevert(); // ERC721 insufficient approval
        mkt.buyItem{value: PRICE}(TOKEN);
        assertTrue(mkt.isListed(TOKEN)); // still listed — tx reverted
    }

    // ---------------- admin ----------------

    function test_SetPlatformFeeBps_CapEnforced() public {
        vm.prank(admin);
        vm.expectRevert(YapMarketplace.FeeTooHigh.selector);
        mkt.setPlatformFeeBps(1001);
    }

    function test_SetPlatformFeeBps_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        mkt.setPlatformFeeBps(100);
    }

    function test_SetTreasury_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        mkt.setTreasury(bob);
        vm.prank(admin);
        mkt.setTreasury(bob);
        assertEq(mkt.treasury(), bob);
    }
}
