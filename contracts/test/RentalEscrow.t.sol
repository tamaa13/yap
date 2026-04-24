// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {IERC721Receiver} from "openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// @dev Contract that can hold NFTs, list them for rent, and on native-coin receive attempts
///      to re-enter the escrow's withdraw/refund path.
contract ReentrantOwner is IERC721Receiver {
    RentalEscrow public immutable escrow;
    YapFighter public immutable fighter;
    enum Mode { None, Withdraw }
    Mode public mode;
    uint256 public received;
    bool public reentered;

    constructor(RentalEscrow e, YapFighter f) {
        escrow = e;
        fighter = f;
    }

    function approveAndList(uint256 tokenId, uint256 pricePerDay, uint256 maxDays) external {
        fighter.approve(address(escrow), tokenId);
        escrow.listForRent(tokenId, pricePerDay, maxDays);
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function withdraw() external {
        mode = Mode.Withdraw;
        escrow.withdrawProceeds();
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        received += msg.value;
        if (mode == Mode.Withdraw && !reentered) {
            reentered = true;
            try escrow.withdrawProceeds() {} catch {}
        }
    }
}

/// @dev Renter contract that tries to re-enter rent() from its refund handler.
contract ReentrantRenter {
    RentalEscrow public immutable escrow;
    uint256 public targetId;
    uint256 public targetDays;
    bool public reentered;

    constructor(RentalEscrow e) {
        escrow = e;
    }

    function doRent(uint256 tokenId, uint256 durationDays) external payable {
        targetId = tokenId;
        targetDays = durationDays;
        escrow.rent{value: msg.value}(tokenId, durationDays);
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try escrow.rent{value: msg.value}(targetId, targetDays) {} catch {}
        }
    }
}

contract RentalEscrowTest is Test {
    RentalEscrow internal escrow;
    YapFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal tokenA;
    uint256 internal tokenB;
    uint256 internal tokenC;

    uint256 internal constant PRICE = 0.1 ether;
    uint256 internal constant MAX_DAYS = 30;

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, 0);
        escrow = new RentalEscrow(address(fighter), admin, treasury);

        vm.prank(admin);
        tokenA = fighter.mint(alice, "ipfs://a", keccak256("a"), hex"01");
        vm.prank(admin);
        tokenB = fighter.mint(alice, "ipfs://b", keccak256("b"), hex"02");
        vm.prank(admin);
        tokenC = fighter.mint(alice, "ipfs://c", keccak256("c"), hex"03");

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _list(address owner, uint256 tokenId, uint256 price, uint256 maxDays) internal {
        vm.prank(owner);
        fighter.approve(address(escrow), tokenId);
        vm.prank(owner);
        escrow.listForRent(tokenId, price, maxDays);
    }

    // ---------------- list ----------------

    function test_ListForRent_happyPath() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        RentalEscrow.RentListing memory l = escrow.getRentListing(tokenA);
        assertEq(l.owner, alice);
        assertEq(l.pricePerDay, PRICE);
        assertEq(l.maxDurationDays, MAX_DAYS);
        assertTrue(l.active);
        // NFT custody
        assertEq(fighter.ownerOf(tokenA), address(escrow));
        assertEq(escrow.activeListingsCount(), 1);
    }

    function test_ListForRent_RevertIfNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.listForRent(tokenA, PRICE, MAX_DAYS);
    }

    function test_ListForRent_RevertIfZeroPrice() public {
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.ZeroPrice.selector);
        escrow.listForRent(tokenA, 0, MAX_DAYS);
    }

    function test_ListForRent_RevertIfDurationTooHigh() public {
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.DurationTooHigh.selector);
        escrow.listForRent(tokenA, PRICE, 366);
    }

    function test_ListForRent_RevertIfAlreadyListed() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.AlreadyListed.selector);
        escrow.listForRent(tokenA, PRICE, MAX_DAYS);
    }

    // ---------------- rent ----------------

    function test_Rent_happyPath() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);

        RentalEscrow.ActiveRental memory r = escrow.getActiveRental(tokenA);
        assertEq(r.renter, bob);
        assertEq(r.expiresAt, block.timestamp + 3 days);
        assertEq(r.paid, PRICE * 3);

        uint256 fee = (PRICE * 3 * 250) / 10_000;
        assertEq(escrow.sellerProceeds(alice), PRICE * 3 - fee);
        assertEq(escrow.sellerProceeds(treasury), fee);

        // Canonical YapFighter authorization reflects the rental — the integration win.
        assertTrue(fighter.isExecutor(tokenA, bob));
    }

    function test_Rent_RefundsExcess() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        uint256 before_ = bob.balance;
        vm.prank(bob);
        escrow.rent{value: PRICE * 5 + 0.25 ether}(tokenA, 5);
        // Net outflow must equal exactly cost.
        assertEq(before_ - bob.balance, PRICE * 5);
    }

    function test_Rent_PlatformFee() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 10}(tokenA, 10);
        assertEq(escrow.sellerProceeds(treasury), (PRICE * 10 * 250) / 10_000);
    }

    function test_Rent_RevertIfNotListed() public {
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.NotListed.selector);
        escrow.rent{value: PRICE}(tokenA, 1);
    }

    function test_Rent_RevertIfInsufficientPayment() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.InsufficientPayment.selector);
        escrow.rent{value: PRICE - 1}(tokenA, 1);
    }

    function test_Rent_RevertIfAlreadyRented() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);
        vm.prank(carol);
        vm.expectRevert(RentalEscrow.AlreadyRented.selector);
        escrow.rent{value: PRICE * 2}(tokenA, 2);
    }

    function test_Rent_RevertIfSelfRent() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.SelfRent.selector);
        escrow.rent{value: PRICE}(tokenA, 1);
    }

    function test_Rent_RevertIfDurationExceedsMax() public {
        _list(alice, tokenA, PRICE, 5);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.DurationExceedsMax.selector);
        escrow.rent{value: PRICE * 6}(tokenA, 6);
    }

    function test_Rent_RevertIfZeroDuration() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.ZeroDuration.selector);
        escrow.rent{value: 0}(tokenA, 0);
    }

    function test_Rent_AfterPriorRentalExpired() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 2}(tokenA, 2);
        assertTrue(fighter.isExecutor(tokenA, bob));

        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(carol);
        escrow.rent{value: PRICE * 3}(tokenA, 3);

        // Prior renter revoked; new renter authorized; executor count stays at 1.
        assertFalse(fighter.isExecutor(tokenA, bob));
        assertTrue(fighter.isExecutor(tokenA, carol));
        assertEq(fighter.executorCount(tokenA), 1);
    }

    // ---------------- effectiveUser ----------------

    function test_EffectiveUser_ReturnsRenterDuringRental() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);
        assertEq(escrow.effectiveUser(tokenA), bob);
    }

    function test_EffectiveUser_ReturnsOwnerWhenExpired() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 2}(tokenA, 2);
        vm.warp(block.timestamp + 2 days + 1);
        // Expired but listing still active → owner is the listing owner.
        assertEq(escrow.effectiveUser(tokenA), alice);
    }

    function test_EffectiveUser_ReturnsNftOwnerWhenNotListed() public view {
        // Not listed at all → falls through to fighter.ownerOf.
        assertEq(escrow.effectiveUser(tokenA), alice);
    }

    // ---------------- cancel ----------------

    function test_CancelListing_happyPath() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(alice);
        escrow.cancelRentListing(tokenA);
        assertFalse(escrow.getRentListing(tokenA).active);
        assertEq(fighter.ownerOf(tokenA), alice);
        assertEq(escrow.activeListingsCount(), 0);
    }

    function test_CancelListing_RevertIfActiveRental() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.ActiveRentalExists.selector);
        escrow.cancelRentListing(tokenA);
    }

    function test_CancelListing_RevertIfNotOwner() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.cancelRentListing(tokenA);
    }

    // ---------------- reclaim ----------------

    function test_Reclaim_happyPath() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 2}(tokenA, 2);
        vm.warp(block.timestamp + 2 days + 1);
        // Anyone can reclaim after expiry.
        vm.prank(carol);
        escrow.reclaim(tokenA);
        assertEq(fighter.ownerOf(tokenA), alice);
        assertFalse(escrow.getRentListing(tokenA).active);
        assertFalse(fighter.isExecutor(tokenA, bob));
    }

    function test_Reclaim_RevertIfNotExpired() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);
        vm.expectRevert(RentalEscrow.RentalNotExpired.selector);
        escrow.reclaim(tokenA);
    }

    function test_Reclaim_RevertIfNeverRented() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.expectRevert(RentalEscrow.RentalNotExpired.selector);
        escrow.reclaim(tokenA);
    }

    // ---------------- withdraw ----------------

    function test_WithdrawProceeds_AfterRental() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 4}(tokenA, 4);
        uint256 expected = PRICE * 4 - (PRICE * 4 * 250) / 10_000;

        uint256 before_ = alice.balance;
        vm.prank(alice);
        escrow.withdrawProceeds();
        assertEq(alice.balance - before_, expected);
        assertEq(escrow.sellerProceeds(alice), 0);
    }

    function test_WithdrawProceeds_MultipleRentals() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        _list(alice, tokenB, 2 * PRICE, MAX_DAYS);

        vm.prank(bob);
        escrow.rent{value: PRICE * 3}(tokenA, 3);
        vm.prank(carol);
        escrow.rent{value: 2 * PRICE * 5}(tokenB, 5);

        uint256 rental1 = PRICE * 3;
        uint256 rental2 = 2 * PRICE * 5;
        uint256 expected =
            (rental1 - (rental1 * 250) / 10_000) +
            (rental2 - (rental2 * 250) / 10_000);
        assertEq(escrow.sellerProceeds(alice), expected);

        uint256 before_ = alice.balance;
        vm.prank(alice);
        escrow.withdrawProceeds();
        assertEq(alice.balance - before_, expected);
    }

    function test_WithdrawProceeds_RevertIfEmpty() public {
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.NothingToWithdraw.selector);
        escrow.withdrawProceeds();
    }

    function test_Treasury_WithdrawsAccruedFees() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(bob);
        escrow.rent{value: PRICE * 10}(tokenA, 10);

        uint256 fee = (PRICE * 10 * 250) / 10_000;
        uint256 before_ = treasury.balance;
        vm.prank(treasury);
        escrow.withdrawProceeds();
        assertEq(treasury.balance - before_, fee);
    }

    // ---------------- pause ----------------

    function test_Pause_BlocksRenting() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        vm.prank(admin);
        escrow.pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.rent{value: PRICE}(tokenA, 1);

        vm.prank(admin);
        escrow.unpause();
        vm.prank(bob);
        escrow.rent{value: PRICE * 2}(tokenA, 2);
        assertTrue(escrow.isActiveRental(tokenA));
    }

    function test_Pause_BlocksListing() public {
        vm.prank(admin);
        escrow.pause();
        vm.prank(alice);
        fighter.approve(address(escrow), tokenA);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.listForRent(tokenA, PRICE, MAX_DAYS);
    }

    // ---------------- pagination ----------------

    function test_ActiveRentals_Pagination() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        _list(alice, tokenB, 2 * PRICE, MAX_DAYS);
        _list(alice, tokenC, 3 * PRICE, MAX_DAYS);

        RentalEscrow.RentListing[] memory p1 = escrow.activeRentals(0, 2);
        RentalEscrow.RentListing[] memory p2 = escrow.activeRentals(2, 5);
        RentalEscrow.RentListing[] memory p3 = escrow.activeRentals(10, 5);

        assertEq(p1.length, 2);
        assertEq(p2.length, 1);
        assertEq(p3.length, 0);
        assertEq(p1[0].tokenId, tokenA);
        assertEq(p2[0].tokenId, tokenC);

        vm.expectRevert(RentalEscrow.PageSizeTooLarge.selector);
        escrow.activeRentals(0, 101);
    }

    // ---------------- reentrancy ----------------

    function test_Reentrancy_rent() public {
        _list(alice, tokenA, PRICE, MAX_DAYS);
        ReentrantRenter r = new ReentrantRenter(escrow);
        vm.deal(address(r), 10 ether);

        // 3-day rent paid with overpay → refund triggers receive() → re-enters rent. Must be
        // caught by the nonReentrant guard; outer call still succeeds.
        r.doRent{value: PRICE * 3 + 0.5 ether}(tokenA, 3);
        assertTrue(r.reentered());
        assertEq(escrow.getActiveRental(tokenA).renter, address(r));
        // Only one rental recorded — the re-entry's state change was rolled back.
        assertEq(escrow.getActiveRental(tokenA).paid, PRICE * 3);
    }

    function test_Reentrancy_withdraw() public {
        ReentrantOwner owner = new ReentrantOwner(escrow, fighter);
        vm.prank(admin);
        uint256 id = fighter.mint(address(owner), "ipfs://o", keccak256("o"), hex"99");

        owner.approveAndList(id, PRICE, MAX_DAYS);

        vm.prank(bob);
        escrow.rent{value: PRICE * 4}(id, 4);

        uint256 expected = PRICE * 4 - (PRICE * 4 * 250) / 10_000;
        owner.withdraw();
        assertTrue(owner.reentered());
        assertEq(owner.received(), expected);
        assertEq(escrow.sellerProceeds(address(owner)), 0);
    }

    // ---------------- admin ----------------

    function test_SetPlatformFeeBps_CapEnforced() public {
        vm.prank(admin);
        vm.expectRevert(RentalEscrow.FeeTooHigh.selector);
        escrow.setPlatformFeeBps(1001);
    }

    function test_SetTreasury_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        escrow.setTreasury(bob);
        vm.prank(admin);
        escrow.setTreasury(bob);
        assertEq(escrow.treasury(), bob);
    }

    function test_SetRentalPermissions_OnlyAdmin() public {
        vm.prank(admin);
        escrow.setRentalPermissions(hex"ff");
        assertEq(escrow.rentalPermissions(), hex"ff");
    }

    function test_OnERC721Received_RejectsForeignToken() public {
        vm.prank(alice);
        vm.expectRevert(RentalEscrow.UnsupportedToken.selector);
        escrow.onERC721Received(alice, alice, 1, "");
    }
}
