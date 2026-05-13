// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";

/// @dev Tests cover the co-signed dispute lifecycle on top of the
///      existing RentalEscrow. Each test rents a disputable listing and
///      drives one branch of {accept, dispute → split, dispute → force,
///      timeout claim, force-close from Funded}.
contract RentalEscrowDisputeTest is Test {
    RentalEscrow internal escrow;
    YapFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal tokenA;

    uint256 internal constant PRICE = 0.1 ether;
    uint256 internal constant MAX_DAYS = 30;
    uint256 internal constant DURATION = 3;
    uint256 internal constant COST = PRICE * DURATION;
    // 2.5% default fee on full cost
    uint256 internal constant FEE_FULL = (COST * 250) / 10_000;
    uint256 internal constant OWNER_NET_FULL = COST - FEE_FULL;

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, 0);
        escrow = new RentalEscrow(address(fighter), admin, treasury);

        vm.prank(admin);
        tokenA = fighter.mint(
            alice, "ipfs://a", keccak256("a"), hex"01",
            YapFighter.Archetype.Roaster, keccak256("seed-dispute")
        );

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _listDisputable() internal {
        vm.prank(alice);
        fighter.approve(address(escrow), tokenA);
        vm.prank(alice);
        escrow.listForRentDisputable(tokenA, PRICE, MAX_DAYS);
    }

    function _rent() internal returns (uint64 expiresAt) {
        vm.prank(bob);
        escrow.rent{value: COST}(tokenA, DURATION);
        expiresAt = escrow.getActiveRental(tokenA).expiresAt;
    }

    // ---------------- listForRentDisputable + rent ----------------

    function test_DisputableListing_HoldsFundsInEscrow_NotSellerBalance() public {
        _listDisputable();
        _rent();

        // Funds NOT credited to seller balance — they sit in dispute escrow.
        assertEq(escrow.sellerBalances(alice), 0);
        assertEq(escrow.sellerBalances(treasury), 0);

        RentalEscrow.DisputeState memory d = escrow.getDispute(tokenA);
        assertEq(uint8(d.status), 1);
        assertEq(d.renter, bob);
        assertEq(d.owner, alice);
        assertEq(d.escrowed, COST);
    }

    function test_DisputableListing_HasDisputableFlagSet() public {
        _listDisputable();
        RentalEscrow.RentListing memory l = escrow.getRentListing(tokenA);
        assertTrue(l.disputable);
    }

    // ---------------- acceptRental ----------------

    function test_AcceptRental_ReleasesFundsToOwner_NetOfFee() public {
        _listDisputable();
        uint64 expiresAt = _rent();

        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.acceptRental(tokenA);

        assertEq(escrow.sellerBalances(alice), OWNER_NET_FULL);
        assertEq(escrow.sellerBalances(treasury), FEE_FULL);
        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
    }

    function test_AcceptRental_RevertIfStillLive() public {
        _listDisputable();
        _rent();
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.RentalStillLive.selector);
        escrow.acceptRental(tokenA);
    }

    function test_AcceptRental_RevertIfNotRenter() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.UnauthorizedParty.selector);
        escrow.acceptRental(tokenA);
    }

    function test_AcceptRental_RevertIfAlreadySettled() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.acceptRental(tokenA);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.AlreadySettled.selector);
        escrow.acceptRental(tokenA);
    }

    // ---------------- disputeRental ----------------

    function test_DisputeRental_HappyPath_SetsStatusToDisputed() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);
        assertEq(uint8(escrow.getDispute(tokenA).status), 2);
    }

    function test_DisputeRental_RevertIfWindowClosed() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + escrow.DISPUTE_ACCEPTANCE_PERIOD());
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.AcceptanceWindowClosed.selector);
        escrow.disputeRental(tokenA);
    }

    function test_DisputeRental_RevertIfNotRenter() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(carol);
        vm.expectRevert(RentalEscrow.UnauthorizedParty.selector);
        escrow.disputeRental(tokenA);
    }

    // ---------------- claimRentalTimeout ----------------

    function test_ClaimRentalTimeout_AfterWindow_SettlesToOwner() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + escrow.DISPUTE_ACCEPTANCE_PERIOD());
        // Anyone — carol is unrelated
        vm.prank(carol);
        escrow.claimRentalTimeout(tokenA);
        assertEq(escrow.sellerBalances(alice), OWNER_NET_FULL);
        assertEq(escrow.sellerBalances(treasury), FEE_FULL);
        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
    }

    function test_ClaimRentalTimeout_RevertIfWindowOpen() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(carol);
        vm.expectRevert(RentalEscrow.AcceptanceWindowOpen.selector);
        escrow.claimRentalTimeout(tokenA);
    }

    // ---------------- proposeRentalSplit ----------------

    function test_ProposeSplit_MatchingHashes_AutoSettles_5050() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        uint256 half = COST / 2;
        // Both propose 50/50
        vm.prank(bob);
        escrow.proposeRentalSplit(tokenA, half, COST - half);
        vm.prank(alice);
        escrow.proposeRentalSplit(tokenA, half, COST - half);

        // owner half net of fee on owner's portion
        uint256 ownerPortion = COST - half;
        uint256 fee = (ownerPortion * 250) / 10_000;
        assertEq(escrow.sellerBalances(bob), half);
        assertEq(escrow.sellerBalances(alice), ownerPortion - fee);
        assertEq(escrow.sellerBalances(treasury), fee);
        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
    }

    function test_ProposeSplit_NonMatching_DoesNotSettle() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        // Bob says 100% to renter; Alice says 100% to owner — non-matching
        vm.prank(bob);
        escrow.proposeRentalSplit(tokenA, COST, 0);
        vm.prank(alice);
        escrow.proposeRentalSplit(tokenA, 0, COST);

        // Still in dispute
        assertEq(uint8(escrow.getDispute(tokenA).status), 2);
        assertEq(escrow.sellerBalances(bob), 0);
        assertEq(escrow.sellerBalances(alice), 0);
    }

    function test_ProposeSplit_Reproposing_LastWriteWins() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        // Bob first proposes 100/0, then revises to 50/50
        vm.prank(bob);
        escrow.proposeRentalSplit(tokenA, COST, 0);
        vm.prank(bob);
        escrow.proposeRentalSplit(tokenA, COST / 2, COST - COST / 2);

        // Alice matches the LATEST (50/50)
        vm.prank(alice);
        escrow.proposeRentalSplit(tokenA, COST / 2, COST - COST / 2);

        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
        assertEq(escrow.sellerBalances(bob), COST / 2);
    }

    function test_ProposeSplit_RevertIfInvalidSum() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        vm.prank(bob);
        vm.expectRevert(RentalEscrow.InvalidSplit.selector);
        escrow.proposeRentalSplit(tokenA, COST + 1, 0);
    }

    function test_ProposeSplit_RevertIfNotInDispute() public {
        _listDisputable();
        _rent();
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.NotInDispute.selector);
        escrow.proposeRentalSplit(tokenA, COST, 0);
    }

    function test_ProposeSplit_RevertIfThirdParty() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        vm.prank(carol);
        vm.expectRevert(RentalEscrow.UnauthorizedParty.selector);
        escrow.proposeRentalSplit(tokenA, COST, 0);
    }

    // ---------------- forceCloseRental ----------------

    function test_ForceClose_FromDisputed_RefundsRenter() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        vm.warp(expiresAt + escrow.DISPUTE_MAX_LIFETIME());
        // Anyone — carol is unrelated
        vm.prank(carol);
        escrow.forceCloseRental(tokenA);

        // Full refund to renter, no fee taken
        assertEq(escrow.sellerBalances(bob), COST);
        assertEq(escrow.sellerBalances(alice), 0);
        assertEq(escrow.sellerBalances(treasury), 0);
        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
    }

    function test_ForceClose_FromFunded_SettlesToOwner() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        // No dispute opened — simulate parties going silent past 7d
        vm.warp(expiresAt + escrow.DISPUTE_MAX_LIFETIME());
        vm.prank(carol);
        escrow.forceCloseRental(tokenA);

        assertEq(escrow.sellerBalances(alice), OWNER_NET_FULL);
        assertEq(escrow.sellerBalances(treasury), FEE_FULL);
        assertEq(uint8(escrow.getDispute(tokenA).status), 3);
    }

    function test_ForceClose_RevertIfBeforeMaxLifetime() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        // 1 hour into 7d — not yet
        vm.warp(expiresAt + 1 hours);
        vm.expectRevert(RentalEscrow.LifetimeNotReached.selector);
        escrow.forceCloseRental(tokenA);
    }

    // ---------------- non-disputable path is untouched ----------------

    function test_NonDisputable_StillCreditsSellerImmediately() public {
        // Use the original listForRent — ensures dispute lifecycle is opt-in
        vm.prank(alice);
        fighter.approve(address(escrow), tokenA);
        vm.prank(alice);
        escrow.listForRent(tokenA, PRICE, MAX_DAYS);

        vm.prank(bob);
        escrow.rent{value: COST}(tokenA, DURATION);

        assertEq(escrow.sellerBalances(alice), OWNER_NET_FULL);
        assertEq(escrow.sellerBalances(treasury), FEE_FULL);
        // No DisputeState set
        assertEq(uint8(escrow.getDispute(tokenA).status), 0);
    }

    function test_NonDisputable_AcceptRentalReverts() public {
        vm.prank(alice);
        fighter.approve(address(escrow), tokenA);
        vm.prank(alice);
        escrow.listForRent(tokenA, PRICE, MAX_DAYS);

        vm.prank(bob);
        escrow.rent{value: COST}(tokenA, DURATION);

        // Not a disputable rental — accept should revert (status==0 not 1)
        vm.warp(block.timestamp + DURATION * 1 days + 1);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.AlreadySettled.selector);
        escrow.acceptRental(tokenA);
    }

    // ---------------- end-to-end withdraw ----------------

    function test_Renter_WithdrawsRefund_AfterForceClose() public {
        _listDisputable();
        uint64 expiresAt = _rent();
        vm.warp(expiresAt + 1);
        vm.prank(bob);
        escrow.disputeRental(tokenA);

        vm.warp(expiresAt + escrow.DISPUTE_MAX_LIFETIME());
        escrow.forceCloseRental(tokenA);

        uint256 bobBalanceBefore = bob.balance;
        vm.prank(bob);
        escrow.withdrawProceeds();
        assertEq(bob.balance, bobBalanceBefore + COST);
    }
}
