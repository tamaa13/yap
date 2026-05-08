// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";

/// @notice Fork-test that exercises the disputable rental lifecycle
///         against the live Galileo deploys without broadcasting any
///         transactions. Validates ABI / storage layout / time logic
///         against the real chain state — anything green here means
///         the deployed bytecode handles all three flows.
///
/// Run with:
///   forge test --match-contract RentalDisputeForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract RentalDisputeForkE2ETest is Test {
    YapFighter internal fighter;
    RentalEscrow internal rental;

    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    address constant RENTAL_ADDR = 0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA;
    /// @dev Deployer wallet — owns fighter #1 on Galileo per ownerOf().
    address constant OWNER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;
    uint256 constant TOKEN_ID = 1;

    address internal renter = makeAddr("e2e-renter");

    uint256 constant PRICE = 0.001 ether;
    uint256 constant DURATION = 1; // 1 day — minimum allowed
    uint256 constant COST = PRICE * DURATION;

    function setUp() public {
        fighter = YapFighter(FIGHTER_ADDR);
        rental = RentalEscrow(RENTAL_ADDR);

        // Sanity: fighter exists and is owned by OWNER, escrow is fresh.
        assertEq(fighter.ownerOf(TOKEN_ID), OWNER, "owner mismatch");
        RentalEscrow.RentListing memory l = rental.getRentListing(TOKEN_ID);
        require(!l.active, "fighter already listed - pick a fresh tokenId");

        vm.deal(renter, 10 ether);
    }

    /// @dev Lists the fighter disputable, rents from `renter`, returns
    ///      the rental's expiresAt timestamp so callers can warp.
    function _listAndRent() internal returns (uint64 expiresAt) {
        vm.startPrank(OWNER);
        fighter.setApprovalForAll(RENTAL_ADDR, true);
        rental.listForRentDisputable(TOKEN_ID, PRICE, 30);
        vm.stopPrank();

        vm.prank(renter);
        rental.rent{value: COST}(TOKEN_ID, DURATION);

        // Funds in dispute escrow, NOT in seller balance.
        assertEq(rental.sellerBalances(OWNER), 0, "owner credited too early");
        RentalEscrow.DisputeState memory d = rental.getDispute(TOKEN_ID);
        assertEq(d.status, 1, "expected Funded");
        assertEq(d.escrowed, COST, "escrowed mismatch");
        assertEq(d.renter, renter);
        assertEq(d.owner, OWNER);

        return rental.getActiveRental(TOKEN_ID).expiresAt;
    }

    /// @dev On the live Galileo deploy, treasury == deployer == OWNER, so
    ///      the platform-fee credit lands back on the same wallet as the
    ///      owner credit. We assert the *combined* balance equals COST,
    ///      then break it apart only when treasury and owner differ.
    function _assertOwnerSettledNetOfFee(uint256 cost) internal view {
        uint16 feeBps = rental.platformFeeBps();
        uint256 fee = (cost * feeBps) / 10_000;
        uint256 ownerNet = cost - fee;
        if (rental.treasury() == OWNER) {
            assertEq(rental.sellerBalances(OWNER), cost, "owner+treasury combined");
        } else {
            assertEq(rental.sellerBalances(OWNER), ownerNet, "owner net after accept");
            assertEq(rental.sellerBalances(rental.treasury()), fee, "treasury fee");
        }
    }

    function test_AcceptPath() public {
        uint64 expiresAt = _listAndRent();
        vm.warp(expiresAt + 1);

        vm.prank(renter);
        rental.acceptRental(TOKEN_ID);

        _assertOwnerSettledNetOfFee(COST);
        assertEq(rental.getDispute(TOKEN_ID).status, 3, "expected Settled");
    }

    function test_DisputeAndCoSignedSplitPath() public {
        uint64 expiresAt = _listAndRent();

        // Renter disputes inside the 24h acceptance window.
        vm.warp(expiresAt + 1 hours);
        vm.prank(renter);
        rental.disputeRental(TOKEN_ID);
        assertEq(rental.getDispute(TOKEN_ID).status, 2, "expected Disputed");

        // 50/50 split.
        uint256 half = COST / 2;
        uint256 ownerShare = COST - half;

        vm.prank(renter);
        rental.proposeRentalSplit(TOKEN_ID, half, ownerShare);
        // Single-sided proposal does NOT settle.
        assertEq(rental.getDispute(TOKEN_ID).status, 2, "premature settle");

        vm.prank(OWNER);
        rental.proposeRentalSplit(TOKEN_ID, half, ownerShare);

        uint16 feeBps = rental.platformFeeBps();
        uint256 fee = (ownerShare * feeBps) / 10_000;
        uint256 ownerNet = ownerShare - fee;

        assertEq(rental.sellerBalances(renter), half, "renter share");
        if (rental.treasury() == OWNER) {
            // Treasury == owner ⇒ both credits land on the same wallet.
            assertEq(rental.sellerBalances(OWNER), ownerShare, "owner+treasury combined");
        } else {
            assertEq(rental.sellerBalances(OWNER), ownerNet, "owner share net");
            assertEq(rental.sellerBalances(rental.treasury()), fee, "treasury split fee");
        }
        assertEq(rental.getDispute(TOKEN_ID).status, 3, "expected Settled");
    }

    function test_ForceCloseFromDisputed_RefundsRenterFully() public {
        uint64 expiresAt = _listAndRent();

        vm.warp(expiresAt + 1 hours);
        vm.prank(renter);
        rental.disputeRental(TOKEN_ID);

        // 7d max lifetime
        vm.warp(expiresAt + rental.DISPUTE_MAX_LIFETIME());

        // Anyone — pick an unrelated address.
        address bystander = makeAddr("e2e-bystander");
        vm.prank(bystander);
        rental.forceCloseRental(TOKEN_ID);

        assertEq(rental.sellerBalances(renter), COST, "full refund to renter");
        assertEq(rental.sellerBalances(OWNER), 0, "owner takes nothing on dispute force-close");
        assertEq(rental.sellerBalances(rental.treasury()), 0, "no fee on dispute refund");
        assertEq(rental.getDispute(TOKEN_ID).status, 3);
    }

    function test_ClaimTimeout_AfterAcceptanceWindow_SettlesToOwner() public {
        uint64 expiresAt = _listAndRent();

        // Renter goes silent past the 24h window — anyone can release.
        vm.warp(expiresAt + rental.DISPUTE_ACCEPTANCE_PERIOD());

        address bystander = makeAddr("e2e-bystander");
        vm.prank(bystander);
        rental.claimRentalTimeout(TOKEN_ID);

        _assertOwnerSettledNetOfFee(COST);
        assertEq(rental.getDispute(TOKEN_ID).status, 3);
    }

    function test_ForceCloseFromFunded_AfterMaxLifetime_SettlesToOwner() public {
        uint64 expiresAt = _listAndRent();

        // Both sides go silent past max lifetime — funded never disputed.
        vm.warp(expiresAt + rental.DISPUTE_MAX_LIFETIME());

        rental.forceCloseRental(TOKEN_ID);

        _assertOwnerSettledNetOfFee(COST);
        assertEq(rental.getDispute(TOKEN_ID).status, 3);
    }
}
