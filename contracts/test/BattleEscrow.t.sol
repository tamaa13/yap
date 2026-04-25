// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";

contract ReentrantBettor {
    BattleEscrow public escrow;
    uint256 public battleId;
    bool public entered;

    constructor(BattleEscrow escrow_) {
        escrow = escrow_;
    }

    function bet(uint256 bid, uint8 side) external payable {
        battleId = bid;
        escrow.placeBet{value: msg.value}(bid, side, msg.value);
    }

    function claim(uint256 bid) external {
        battleId = bid;
        escrow.claimPayout(bid);
    }

    receive() external payable {
        if (!entered) {
            entered = true;
            try escrow.claimPayout(battleId) {} catch {}
        }
    }
}

contract MockFighter {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => mapping(address => bool)) private _exec;

    function set(uint256 tokenId, address owner) external {
        ownerOf[tokenId] = owner;
    }

    function grantExec(uint256 tokenId, address user) external {
        _exec[tokenId][user] = true;
    }

    function isExecutor(uint256 tokenId, address user) external view returns (bool) {
        return _exec[tokenId][user];
    }
}

contract BattleEscrowTest is Test {
    BattleEscrow internal escrow;
    MockFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    /// Oracle private key. Stored as uint256 so tests can produce real ECDSA
    /// signatures via vm.sign() — {submitVerdict} now verifies the sig
    /// cryptographically rather than trusting a role.
    uint256 internal constant ORACLE_PRIV_KEY = 0xA1A2A3;
    address internal tee; // = vm.addr(ORACLE_PRIV_KEY), populated in setUp
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dan = makeAddr("dan");

    uint256 internal constant FIGHTER_A = 1;
    uint256 internal constant FIGHTER_B = 2;
    /// Default challenger stake used by _create helpers.
    uint256 internal constant CHALLENGER_STAKE = 1 ether;
    /// Default defender stake used by _create helpers.
    uint256 internal constant DEFENDER_STAKE = 1 ether;

    function setUp() public {
        tee = vm.addr(ORACLE_PRIV_KEY);
        fighter = new MockFighter();
        // alice owns fighter A (challenger); bob owns fighter B (defender).
        fighter.set(FIGHTER_A, alice);
        fighter.set(FIGHTER_B, bob);
        escrow = new BattleEscrow(admin, treasury, tee, address(fighter));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dan, 100 ether);
    }

    /// Create + accept — helper for tests that don't care about the Pending
    /// intermediate state and want a Live battle to interact with.
    function _create() internal returns (uint256 id) {
        vm.prank(alice);
        id = escrow.createBattle{value: CHALLENGER_STAKE}(
            FIGHTER_A,
            FIGHTER_B,
            "is cereal soup?",
            3
        );
        vm.prank(bob);
        escrow.acceptBattle{value: DEFENDER_STAKE}(id);
    }

    /// Create only — leaves battle in Pending state.
    function _createPending() internal returns (uint256 id) {
        vm.prank(alice);
        id = escrow.createBattle{value: CHALLENGER_STAKE}(
            FIGHTER_A,
            FIGHTER_B,
            "is cereal soup?",
            3
        );
    }

    /// Default transcript commitment used in tests that don't care about
    /// verdict-content binding semantics — only that the verdictHash is
    /// non-zero and consistent across signing + submission.
    bytes32 internal constant MOCK_VERDICT_HASH = keccak256("yap-test-transcript");

    /// Sign a verdict for (battleId, winner, MOCK_VERDICT_HASH) using the oracle private key.
    /// Matches the on-chain digest construction in {submitVerdict}.
    function _signVerdict(uint256 battleId, uint8 winner) internal view returns (bytes memory sig) {
        return _signVerdict(battleId, winner, MOCK_VERDICT_HASH);
    }

    function _signVerdict(uint256 battleId, uint8 winner, bytes32 verdictHash)
        internal
        view
        returns (bytes memory sig)
    {
        bytes32 digest = escrow.verdictDigest(battleId, winner, verdictHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PRIV_KEY, digest);
        sig = abi.encodePacked(r, s, v);
    }

    // ---------------- create ----------------

    function test_CreateBattle_StartsPending() public {
        uint256 id = _createPending();
        assertEq(id, 1);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.fighterA, FIGHTER_A);
        assertEq(b.fighterB, FIGHTER_B);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Pending));
    }

    function test_CreateBattle_HelperMovesToLive() public {
        uint256 id = _create();
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Live));
    }

    function test_CreateBattle_RevertsSameFighter() public {
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.SameFighter.selector);
        escrow.createBattle{value: CHALLENGER_STAKE}(FIGHTER_A, FIGHTER_A, "x", 3);
    }

    function test_CreateBattle_RevertsIfNotFighterUser() public {
        // carol doesn't own fighter A
        vm.prank(carol);
        vm.expectRevert(BattleEscrow.NotFighterUser.selector);
        escrow.createBattle{value: CHALLENGER_STAKE}(FIGHTER_A, FIGHTER_B, "x", 3);
    }

    function test_CreateBattle_RevertsZeroStake() public {
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.ZeroAmount.selector);
        escrow.createBattle{value: 0}(FIGHTER_A, FIGHTER_B, "x", 3);
    }

    function test_CreateBattle_StakeRecordedAsSideABet() public {
        uint256 id = _createPending();
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.poolA, CHALLENGER_STAKE);
        assertEq(b.poolB, 0);
        BattleEscrow.BetOf memory bet = escrow.getBet(id, alice);
        assertEq(bet.amount, CHALLENGER_STAKE);
        assertEq(bet.side, 0); // SIDE_A
    }

    function test_CreateBattle_ExecutorCanChallenge() public {
        // dan is authorized executor of fighter A (e.g. active rental renter)
        fighter.grantExec(FIGHTER_A, dan);
        vm.prank(dan);
        uint256 id = escrow.createBattle{value: CHALLENGER_STAKE}(
            FIGHTER_A,
            FIGHTER_B,
            "x",
            3
        );
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Pending));
    }

    // ---------------- accept / decline ----------------

    function test_AcceptBattle_MovesToLive() public {
        uint256 id = _createPending();
        vm.prank(bob);
        escrow.acceptBattle{value: DEFENDER_STAKE}(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Live));
        assertEq(b.poolB, DEFENDER_STAKE);
        BattleEscrow.BetOf memory bet = escrow.getBet(id, bob);
        assertEq(bet.amount, DEFENDER_STAKE);
        assertEq(bet.side, 1); // SIDE_B
    }

    function test_AcceptBattle_RejectsZeroStake() public {
        uint256 id = _createPending();
        vm.prank(bob);
        vm.expectRevert(BattleEscrow.DefenderStakeTooLow.selector);
        escrow.acceptBattle{value: 0}(id);
    }

    function test_AcceptBattle_RejectsBelow75PctMatch() public {
        uint256 id = _createPending(); // challenger staked CHALLENGER_STAKE = 1 ether
        // 0.74 ether = below 75% of 1 ether
        vm.prank(bob);
        vm.expectRevert(BattleEscrow.DefenderStakeTooLow.selector);
        escrow.acceptBattle{value: 0.74 ether}(id);
    }

    function test_AcceptBattle_AcceptsExactly75PctMatch() public {
        uint256 id = _createPending();
        vm.prank(bob);
        escrow.acceptBattle{value: 0.75 ether}(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Live));
        assertEq(b.poolB, 0.75 ether);
    }

    function test_AcceptBattle_RevertsIfNotDefender() public {
        uint256 id = _createPending();
        // carol doesn't own fighter B
        vm.prank(carol);
        vm.expectRevert(BattleEscrow.NotFighterUser.selector);
        escrow.acceptBattle{value: DEFENDER_STAKE}(id);
    }

    function test_AcceptBattle_RevertsIfAlreadyLive() public {
        uint256 id = _create();
        vm.prank(bob);
        vm.expectRevert(BattleEscrow.InvalidState.selector);
        escrow.acceptBattle(id);
    }

    function test_DeclineBattle_CancelsChallenge() public {
        uint256 id = _createPending();
        vm.prank(bob);
        escrow.declineBattle(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Cancelled));
    }

    function test_DeclineBattle_RevertsIfNotDefender() public {
        uint256 id = _createPending();
        vm.prank(carol);
        vm.expectRevert(BattleEscrow.NotFighterUser.selector);
        escrow.declineBattle(id);
    }

    // ---------------- cancel pending ----------------

    function test_CancelPending_ChallengerCanWithdraw() public {
        uint256 id = _createPending();
        vm.prank(alice);
        escrow.cancel(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Cancelled));
    }

    function test_CancelPending_ThirdPartyBlockedBeforeExpiry() public {
        uint256 id = _createPending();
        vm.prank(carol);
        vm.expectRevert(BattleEscrow.ChallengeNotExpired.selector);
        escrow.cancel(id);
    }

    function test_CancelPending_ThirdPartyOkAfterExpiry() public {
        uint256 id = _createPending();
        vm.warp(block.timestamp + escrow.CHALLENGE_EXPIRY() + 1);
        vm.prank(carol);
        escrow.cancel(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Cancelled));
    }

    function test_PlaceBet_RevertsDuringPending() public {
        uint256 id = _createPending();
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.InvalidState.selector);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether);
    }

    // ---------------- bet ----------------

    function test_PlaceBet_AccumulatesPool() public {
        uint256 id = _create(); // +1 ether on A, +1 ether on B from helper
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether); // alice total 2
        vm.prank(bob);
        escrow.placeBet{value: 2 ether}(id, 1, 2 ether); // bob total 3

        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.poolA, 2 ether);
        assertEq(b.poolB, 3 ether);
    }

    function test_PlaceBet_RevertsWrongSide() public {
        uint256 id = _create();
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether);
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.InvalidSide.selector);
        escrow.placeBet{value: 1 ether}(id, 1, 1 ether);
    }

    function test_PlaceBet_RevertsAfterVerdict() public {
        uint256 id = _create();
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, _signVerdict(id, 0));
        vm.prank(bob);
        vm.expectRevert(BattleEscrow.InvalidState.selector);
        escrow.placeBet{value: 1 ether}(id, 1, 1 ether);
    }

    function test_PlaceBet_RevertsOnMsgValueMismatch() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.ZeroAmount.selector);
        escrow.placeBet{value: 1 ether}(id, 0, 2 ether);
    }

    // ---------------- settle / payout ----------------

    function test_Settle_PayoutsProRata() public {
        uint256 id = _create(); // alice +1 ether on A, bob +1 ether on B

        // After _create + additional bets:
        //   A pool: alice (1 from create + 1 added) + carol 3 = 5 ether
        //   B pool: bob (1 from accept + 5 added) + dan 5 = 11 ether
        //   Total 16, fee 2.5% = 0.4, net = 15.6
        //   A wins → alice (2/5)*15.6 = 6.24, carol (3/5)*15.6 = 9.36
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether);
        vm.prank(carol);
        escrow.placeBet{value: 3 ether}(id, 0, 3 ether);
        vm.prank(bob);
        escrow.placeBet{value: 5 ether}(id, 1, 5 ether);
        vm.prank(dan);
        escrow.placeBet{value: 5 ether}(id, 1, 5 ether);

        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, _signVerdict(id, 0));

        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        assertEq(treasury.balance, 0.4 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 6.24 ether);

        uint256 carolBefore = carol.balance;
        vm.prank(carol);
        escrow.claimPayout(id);
        assertEq(carol.balance - carolBefore, 9.36 ether);

        // Losers claim: nothing.
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance, bobBefore);
    }

    function test_Settle_RevertsDuringDisputeWindow() public {
        uint256 id = _create();
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, _signVerdict(id, 0));
        vm.expectRevert(BattleEscrow.DisputeWindowActive.selector);
        escrow.settle(id);
    }

    function test_Settle_Draw_RefundsStakes() public {
        uint256 id = _create(); // alice 1 A, bob 1 B
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether); // alice total 2
        vm.prank(bob);
        escrow.placeBet{value: 2 ether}(id, 1, 2 ether); // bob total 3

        escrow.submitVerdict(id, 2, MOCK_VERDICT_HASH, _signVerdict(id, 2));
        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        assertEq(treasury.balance, 0); // no fee on draw
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 2 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 3 ether);
    }

    function test_Settle_PayoutCapRefundsLoserSurplus() public {
        // Challenger stakes 1 ether on A (from create). Defender accepts with
        // 1 ether on B (matched). Spectator carol piles 9 ether on A,
        // making the pool wildly asymmetric (A: 10, B: 1).
        // Winner = B. Normal pari-mutuel would give bob (the only B bettor)
        // 10.75 ether (≈10.75× stake). The 5× cap limits bob's take, and
        // the surplus returns pro-rata to the losing A-side bettors.
        uint256 id = _createPending(); // alice stakes 1 ether on A
        vm.prank(bob);
        escrow.acceptBattle{value: 1 ether}(id); // bob stakes 1 ether on B

        vm.prank(carol);
        escrow.placeBet{value: 9 ether}(id, 0, 9 ether); // carol adds 9 on A

        escrow.submitVerdict(id, 1, MOCK_VERDICT_HASH, _signVerdict(id, 1)); // B wins
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);
        escrow.settle(id);

        // Pool = 11, fee 2.5% = 0.275, net = 10.725.
        // Winner pool = 1 (bob). Uncapped payout = 10.725 (≈10.725× stake).
        // Cap 5× → bob gets 5 ether. Surplus = 10.725 - 5 = 5.725.
        // Loser pool = 10 (alice 1 + carol 9). Surplus prorata:
        //   alice gets 5.725 * 1/10 = 0.5725
        //   carol gets 5.725 * 9/10 = 5.1525

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 5 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 0.5725 ether);

        uint256 carolBefore = carol.balance;
        vm.prank(carol);
        escrow.claimPayout(id);
        assertEq(carol.balance - carolBefore, 5.1525 ether);
    }

    function test_Settle_WithinCap_NoLoserRefund() public {
        // Balanced market: A 1, B 1. Winner = B. Pro-rata 0.975 (below cap).
        // No surplus → losing side gets 0.
        uint256 id = _create(); // alice 1 A, bob 1 B (matched 100%)

        escrow.submitVerdict(id, 1, MOCK_VERDICT_HASH, _signVerdict(id, 1));
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);
        escrow.settle(id);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 1.95 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance, aliceBefore); // no refund — within cap
    }

    function test_Cancel_TimeoutRefunds() public {
        uint256 id = _create(); // alice 1 A, bob 1 B (both in escrow)
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether); // alice total 2

        vm.expectRevert(BattleEscrow.TimeoutNotReached.selector);
        escrow.cancel(id);

        vm.warp(block.timestamp + 48 hours + 1);
        escrow.cancel(id);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 2 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 1 ether);
    }

    function test_ClaimPayout_DoubleClaimReverts() public {
        uint256 id = _create();
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, _signVerdict(id, 0));
        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        vm.prank(alice);
        escrow.claimPayout(id);
        vm.prank(alice);
        vm.expectRevert(BattleEscrow.NothingToClaim.selector);
        escrow.claimPayout(id);
    }

    // ---------------- oracle signature verification ----------------

    function test_SubmitVerdict_RevertsOnBadSignature() public {
        uint256 id = _create();
        // Sig from a WRONG key (different from oracleKey).
        bytes32 digest = escrow.verdictDigest(id, 0, MOCK_VERDICT_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);
        vm.expectRevert(BattleEscrow.InvalidOracleSignature.selector);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, badSig);
    }

    function test_SubmitVerdict_WrongWinnerInvalidatesSignature() public {
        uint256 id = _create();
        // Signed for winner=0, submitted with winner=1 → digest mismatch.
        bytes memory sigForA = _signVerdict(id, 0);
        vm.expectRevert(BattleEscrow.InvalidOracleSignature.selector);
        escrow.submitVerdict(id, 1, MOCK_VERDICT_HASH, sigForA);
    }

    function test_SubmitVerdict_AnyoneCanRelayValidSig() public {
        uint256 id = _create();
        bytes memory sig = _signVerdict(id, 0);
        // Carol (unrelated) submits — should succeed because the sig is valid.
        vm.prank(carol);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, sig);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Verdict));
    }

    function test_SetOracleKey_RotatesAndInvalidatesOldKey() public {
        uint256 id = _create();

        // Rotate to a new oracle key.
        uint256 newKey = 0xBEEF;
        address newAddr = vm.addr(newKey);
        vm.prank(admin);
        escrow.setOracleKey(newAddr);
        assertEq(escrow.oracleKey(), newAddr);

        // Old oracle key can no longer sign valid verdicts.
        bytes memory oldSig = _signVerdict(id, 0);
        vm.expectRevert(BattleEscrow.InvalidOracleSignature.selector);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, oldSig);

        // New key signs valid.
        bytes32 digest = escrow.verdictDigest(id, 0, MOCK_VERDICT_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, digest);
        bytes memory newSig = abi.encodePacked(r, s, v);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, newSig);
    }

    function test_ReentrancyOnClaim_Blocked() public {
        uint256 id = _create();
        ReentrantBettor attacker = new ReentrantBettor(escrow);
        vm.deal(address(attacker), 2 ether);
        attacker.bet{value: 1 ether}(id, 0);

        vm.prank(bob);
        escrow.placeBet{value: 1 ether}(id, 1, 1 ether);

        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, _signVerdict(id, 0));
        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        uint256 before_ = address(attacker).balance;
        attacker.claim(id);
        vm.expectRevert(BattleEscrow.NothingToClaim.selector);
        attacker.claim(id);
        assertGt(address(attacker).balance, before_);
    }
}
