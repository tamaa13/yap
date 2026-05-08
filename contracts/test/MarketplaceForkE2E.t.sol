// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";
import {YapFighter} from "../src/YapFighter.sol";

/// @notice Fork-test that runs the marketplace lifecycle against the
///         live Galileo deploy (no broadcasts, no spent OG). Validates
///         the deployed bytecode handles list / cancel / price-update /
///         buy / pull-payment paths with current chain state.
///
/// Run with:
///   forge test --match-contract MarketplaceForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract MarketplaceForkE2ETest is Test {
    YapFighter internal fighter;
    YapMarketplace internal market;

    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    address constant MARKET_ADDR = 0x076E42A64e4ba43700EBB0830086138468DFa275;
    /// @dev Deployer wallet — owns fighter #5 on Galileo per ownerOf().
    address constant SELLER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;
    uint256 constant TOKEN_ID = 5;

    address internal buyer = makeAddr("e2e-buyer");

    uint256 constant PRICE = 0.5 ether;

    function setUp() public {
        fighter = YapFighter(FIGHTER_ADDR);
        market = YapMarketplace(MARKET_ADDR);

        assertEq(fighter.ownerOf(TOKEN_ID), SELLER, "seller not owner");
        require(!market.getListing(TOKEN_ID).active, "fighter already listed");

        vm.deal(buyer, 5 ether);
    }

    function _approveAndList() internal {
        vm.startPrank(SELLER);
        fighter.setApprovalForAll(MARKET_ADDR, true);
        market.listItem(TOKEN_ID, PRICE);
        vm.stopPrank();

        YapMarketplace.Listing memory l = market.getListing(TOKEN_ID);
        assertTrue(l.active, "listing inactive after listItem");
        assertEq(l.seller, SELLER);
        assertEq(l.price, PRICE);
    }

    /// @dev Treasury defaulted to deployer at deploy time on Galileo, so
    ///      the platform-fee credit lands on the same wallet as the
    ///      seller credit. Helper handles both topologies.
    function _assertSellerSettledNetOfFee(uint256 price) internal view {
        uint16 feeBps = market.platformFeeBps();
        uint256 fee = (price * feeBps) / 10_000;
        if (market.treasury() == SELLER) {
            assertEq(market.sellerBalances(SELLER), price, "seller+treasury combined");
        } else {
            assertEq(market.sellerBalances(SELLER), price - fee, "seller net");
            assertEq(market.sellerBalances(market.treasury()), fee, "treasury fee");
        }
    }

    function test_HappyPath_ListBuyWithdraw() public {
        _approveAndList();

        vm.prank(buyer);
        market.buyItem{value: PRICE}(TOKEN_ID);

        // NFT transferred to buyer
        assertEq(fighter.ownerOf(TOKEN_ID), buyer, "NFT didn't transfer");
        // Listing removed
        assertFalse(market.getListing(TOKEN_ID).active, "listing still active");
        // Seller credited via pull-payment (net of fee, possibly combined)
        _assertSellerSettledNetOfFee(PRICE);

        // Seller withdraws — viem-style pull
        uint256 sellerBalanceBefore = SELLER.balance;
        uint256 expectedPayout = market.sellerBalances(SELLER);
        vm.prank(SELLER);
        market.withdrawProceeds();
        assertEq(
            SELLER.balance,
            sellerBalanceBefore + expectedPayout,
            "seller didn't receive withdraw"
        );
        assertEq(market.sellerBalances(SELLER), 0, "balance not cleared");
    }

    function test_BuyRefundsExcessPayment() public {
        _approveAndList();

        uint256 buyerBefore = buyer.balance;
        uint256 overpay = PRICE + 0.25 ether;

        vm.prank(buyer);
        market.buyItem{value: overpay}(TOKEN_ID);

        // Buyer should be charged exactly PRICE (overpay refunded)
        assertEq(buyer.balance, buyerBefore - PRICE, "overpay not refunded");
        assertEq(fighter.ownerOf(TOKEN_ID), buyer);
    }

    function test_CancelListing_RemovesIt() public {
        _approveAndList();

        vm.prank(SELLER);
        market.cancelListing(TOKEN_ID);

        assertFalse(market.getListing(TOKEN_ID).active, "listing still active after cancel");
        // NFT still with seller
        assertEq(fighter.ownerOf(TOKEN_ID), SELLER);
    }

    function test_UpdatePrice_ReflectsNewValue() public {
        _approveAndList();

        uint256 newPrice = PRICE * 2;
        vm.prank(SELLER);
        market.updatePrice(TOKEN_ID, newPrice);

        assertEq(market.getListing(TOKEN_ID).price, newPrice, "price didn't update");
    }

    function test_BuyAtNewPrice_AfterUpdate() public {
        _approveAndList();

        uint256 newPrice = PRICE * 2;
        vm.prank(SELLER);
        market.updatePrice(TOKEN_ID, newPrice);

        // Old price now insufficient
        vm.prank(buyer);
        vm.expectRevert(YapMarketplace.InsufficientPayment.selector);
        market.buyItem{value: PRICE}(TOKEN_ID);

        // New price works
        vm.prank(buyer);
        market.buyItem{value: newPrice}(TOKEN_ID);
        assertEq(fighter.ownerOf(TOKEN_ID), buyer);
    }

    function test_RevertOnSelfBuy() public {
        _approveAndList();

        vm.prank(SELLER);
        vm.expectRevert(YapMarketplace.SelfBuy.selector);
        market.buyItem{value: PRICE}(TOKEN_ID);
    }

    function test_RevertOnInsufficientPayment() public {
        _approveAndList();

        vm.prank(buyer);
        vm.expectRevert(YapMarketplace.InsufficientPayment.selector);
        market.buyItem{value: PRICE - 1}(TOKEN_ID);
    }

    function test_RevertOnDoubleListing() public {
        _approveAndList();

        vm.prank(SELLER);
        vm.expectRevert(YapMarketplace.AlreadyListed.selector);
        market.listItem(TOKEN_ID, PRICE);
    }

    function test_RevertCancelByNonSeller() public {
        _approveAndList();

        vm.prank(buyer);
        vm.expectRevert(YapMarketplace.NotSeller.selector);
        market.cancelListing(TOKEN_ID);
    }

    function test_BuyClearsApprovalAfterTransfer() public {
        // Note: after safeTransferFrom, ERC-7857 (YapFighter) clears
        // single-token approval per OpenZeppelin's _update. Verifies the
        // marketplace doesn't accidentally leave approvals dangling.
        _approveAndList();

        vm.prank(buyer);
        market.buyItem{value: PRICE}(TOKEN_ID);

        // setApprovalForAll persists (it's seller-scoped, not token-scoped)
        // but per-token approval should be cleared on transfer.
        assertEq(fighter.getApproved(TOKEN_ID), address(0), "approval not cleared");
    }
}
