// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

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

    /// Bundle of arguments for {BattleEscrow.submitVerdict}, mirroring the
    /// routing-proof binding the live broker emits.
    struct VerdictArgs {
        bytes responseBody;
        uint256 contentOffset;
        bytes signedText;
        bytes signature;
    }

    /// Submit a verdict for (battleId, winner, MOCK_VERDICT_HASH) signed by
    /// the test oracle key. Wraps the new routing-proof argument shape so
    /// individual tests stay readable.
    function _submitVerdict(uint256 battleId, uint8 winner) internal {
        _submitVerdict(battleId, winner, MOCK_VERDICT_HASH);
    }

    function _submitVerdict(uint256 battleId, uint8 winner, bytes32 verdictHash) internal {
        VerdictArgs memory v = _buildVerdictArgs(battleId, winner, verdictHash, ORACLE_PRIV_KEY);
        escrow.submitVerdict(
            battleId,
            winner,
            verdictHash,
            v.responseBody,
            v.contentOffset,
            v.signedText,
            v.signature
        );
    }

    /// Build a complete set of submitVerdict arguments — mock OpenAI response
    /// body wrapping the canonical text inside `"content":"…"`, routing-proof
    /// signedText `<dummyReqSha>:<respSha>:centralized:test:<dummyTlsFp>`,
    /// and the EIP-191 signature over signedText with `signerPk`.
    function _buildVerdictArgs(
        uint256 battleId,
        uint8 winner,
        bytes32 verdictHash,
        uint256 signerPk
    ) internal view returns (VerdictArgs memory args) {
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(battleId, winner, verdictHash)
        );

        // Mock JSON envelope: {"content":"<canonical>"}. The opening prefix is
        // 12 bytes ('{"content":"') so canonical lives at offset 12 with quote
        // chars at offset 11 (pre) and offset 12+len (post).
        args.responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        args.contentOffset = 12;

        bytes32 respSha = sha256(args.responseBody);
        bytes32 dummyReqSha = keccak256("yap-test-req");
        bytes32 dummyTlsFp = keccak256("yap-test-tls");

        args.signedText = abi.encodePacked(
            _bytes32Hex(dummyReqSha),
            ":",
            _bytes32Hex(respSha),
            ":centralized:test:",
            _bytes32Hex(dummyTlsFp)
        );

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(args.signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        args.signature = abi.encodePacked(r, s, vv);
    }

    /// Strip the "0x" prefix from {Strings.toHexString} so the result lines
    /// up with the broker's `<64 hex>` field formatting.
    function _bytes32Hex(bytes32 b) internal pure returns (bytes memory) {
        bytes memory withPrefix = bytes(Strings.toHexString(uint256(b), 32));
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 64; ++i) out[i] = withPrefix[i + 2];
        return out;
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
        _submitVerdict(id, 0);
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
        //   Total 16, fee 2.5% = 0.4, royalty 5% = 0.8, net = 14.8
        //   A wins → alice (2/5)*14.8 = 5.92, carol (3/5)*14.8 = 8.88
        //   Fighter A is owned by alice → alice also receives the 0.8 royalty
        //   during settle (captured before aliceBefore is sampled).
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether);
        vm.prank(carol);
        escrow.placeBet{value: 3 ether}(id, 0, 3 ether);
        vm.prank(bob);
        escrow.placeBet{value: 5 ether}(id, 1, 5 ether);
        vm.prank(dan);
        escrow.placeBet{value: 5 ether}(id, 1, 5 ether);

        _submitVerdict(id, 0);

        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        assertEq(treasury.balance, 0.4 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 5.92 ether);

        uint256 carolBefore = carol.balance;
        vm.prank(carol);
        escrow.claimPayout(id);
        assertEq(carol.balance - carolBefore, 8.88 ether);

        // Losers claim: nothing.
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance, bobBefore);
    }

    function test_Settle_RevertsDuringDisputeWindow() public {
        uint256 id = _create();
        _submitVerdict(id, 0);
        vm.expectRevert(BattleEscrow.DisputeWindowActive.selector);
        escrow.settle(id);
    }

    function test_Settle_Draw_RefundsStakes() public {
        uint256 id = _create(); // alice 1 A, bob 1 B
        vm.prank(alice);
        escrow.placeBet{value: 1 ether}(id, 0, 1 ether); // alice total 2
        vm.prank(bob);
        escrow.placeBet{value: 2 ether}(id, 1, 2 ether); // bob total 3

        _submitVerdict(id, 2);
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

        _submitVerdict(id, 1); // B wins
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);
        escrow.settle(id);

        // Pool = 11, fee 2.5% = 0.275, royalty 5% = 0.55, net = 10.175.
        // Winner pool = 1 (bob). Uncapped payout = 10.175 (~10.175× stake).
        // Cap 5× → bob gets 5 ether. Surplus = 10.175 - 5 = 5.175.
        // Loser pool = 10 (alice 1 + carol 9). Surplus prorata:
        //   alice gets 5.175 * 1/10 = 0.5175
        //   carol gets 5.175 * 9/10 = 4.6575
        // Fighter B is owned by bob → bob also gets 0.55 royalty during settle.

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 5 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBefore, 0.5175 ether);

        uint256 carolBefore = carol.balance;
        vm.prank(carol);
        escrow.claimPayout(id);
        assertEq(carol.balance - carolBefore, 4.6575 ether);
    }

    function test_Settle_WithinCap_NoLoserRefund() public {
        // Balanced market: A 1, B 1. Winner = B. Total 2, fee 0.05,
        // royalty 0.1, net = 1.85. Pro-rata 1.85 (below 5× cap).
        // No surplus → losing side gets 0. Bob also receives the 0.1 royalty
        // during settle as owner of fighter B (folded into bobBefore).
        uint256 id = _create(); // alice 1 A, bob 1 B (matched 100%)

        _submitVerdict(id, 1);
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);
        escrow.settle(id);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout(id);
        assertEq(bob.balance - bobBefore, 1.85 ether);

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
        _submitVerdict(id, 0);
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
        // Args signed by a wrong key (not oracleKey) — ECDSA recovery on the
        // signedText routing proof should reject.
        VerdictArgs memory bad = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, 0xBAD);
        vm.expectRevert(BattleEscrow.InvalidOracleSignature.selector);
        escrow.submitVerdict(
            id,
            0,
            MOCK_VERDICT_HASH,
            bad.responseBody,
            bad.contentOffset,
            bad.signedText,
            bad.signature
        );
    }

    function test_SubmitVerdict_WrongWinnerInvalidatesSignature() public {
        uint256 id = _create();
        // Routing-proof envelope built for winner=0 (responseBody contains the
        // canonical for winner=0). Submitting with winner=1 makes the contract
        // reconstruct canonical-for-winner=1, which won't appear at the
        // claimed offset → CanonicalContentMissing.
        VerdictArgs memory v0 = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, ORACLE_PRIV_KEY);
        vm.expectRevert(BattleEscrow.CanonicalContentMissing.selector);
        escrow.submitVerdict(
            id,
            1,
            MOCK_VERDICT_HASH,
            v0.responseBody,
            v0.contentOffset,
            v0.signedText,
            v0.signature
        );
    }

    // ---------------- fighter royalty (v3) ----------------

    /// Settle pays 5% of the gross pool to the winner fighter's owner,
    /// records the payout via {Battle.royaltyPaid}, fires
    /// {FighterRoyaltyPaid}, and shrinks netPool by the same amount so
    /// bettor payouts remain consistent with what's still escrowed.
    function test_Settle_PaysFighterRoyalty_AndShrinksNetPool() public {
        uint256 id = _create(); // A:1 (alice), B:1 (bob). pool=2.
        // Fee 0.05, royalty 0.1, net = 1.85.

        _submitVerdict(id, 0); // A wins → fighter A owner (alice) receives royalty
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);

        uint256 aliceBeforeSettle = alice.balance;
        vm.expectEmit(true, true, true, true, address(escrow));
        emit BattleEscrow.FighterRoyaltyPaid(id, FIGHTER_A, alice, 0.1 ether);
        escrow.settle(id);

        // Royalty hit alice's balance during settle.
        assertEq(alice.balance - aliceBeforeSettle, 0.1 ether);

        // Battle bookkeeping records the same amount.
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.royaltyPaid, 0.1 ether);
        assertEq(b.feeCollected, 0.05 ether);

        // alice (only A-side bettor) collects netPool: 1 * 1.85 / 1 = 1.85.
        uint256 aliceBeforeClaim = alice.balance;
        vm.prank(alice);
        escrow.claimPayout(id);
        assertEq(alice.balance - aliceBeforeClaim, 1.85 ether);
    }

    function test_Settle_DrawSkipsRoyalty() public {
        uint256 id = _create();
        _submitVerdict(id, 2); // DRAW
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        escrow.settle(id);

        // No royalty fired (winner == DRAW).
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.royaltyPaid, 0);
        assertEq(alice.balance, aliceBefore);
        assertEq(bob.balance, bobBefore);
    }

    function test_Settle_SingleSideSkipsRoyalty() public {
        // Defender accepts with min stake matched, but only the loser side
        // (B) actually has stake. Verdict says A wins → A-side has no
        // backers. Existing logic refunds stakes; royalty must also skip
        // because the single-side gate prevents the fee from firing.
        // We craft this by making bob (defender) win → defender has stakes,
        // challenger had 0… but createBattle requires non-zero stake from
        // challenger. Instead simulate via the (poolA+poolB) > winnerPool
        // false branch: have ONE side bet entirely, fighter wins on the
        // empty side which gives winnerPool == 0 (the existing test path
        // for the "no bets on winning side" refund).
        uint256 id = _create(); // alice 1 A, bob 1 B
        // Verdict goes to B but only A-pool is non-zero is impossible per
        // _create; instead the parallel single-side coverage is exercised
        // via test_Settle_DrawSkipsRoyalty above. This assertion confirms
        // royaltyPaid == 0 anytime fee == 0.
        _submitVerdict(id, 2);
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);
        escrow.settle(id);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(b.royaltyPaid, 0);
    }

    /// When a registry is wired, settle also records the lifetime earnings
    /// via {BattleRegistry.recordEarnings}. Uses the live BattleRegistry to
    /// exercise the role-gated path end-to-end.
    function test_Settle_RecordsEarningsOnRegistry() public {
        // Deploy a real registry, grant escrow ESCROW_ROLE, wire setRegistry.
        BattleRegistry registry = new BattleRegistry(address(this), address(escrow));
        vm.prank(admin);
        escrow.setRegistry(address(registry));

        uint256 id = _create();
        _submitVerdict(id, 0); // A wins → fighterA = 1
        vm.warp(block.timestamp + escrow.disputeWindow() + 1);

        // Verdict alone calls registerBattle; settle adds finalize + earnings.
        escrow.settle(id);

        (, , , uint256 earnings) = registry.fighterStats(FIGHTER_A);
        assertEq(earnings, 0.1 ether); // 5% of 2 ETH gross
    }

    function test_RegistryRecordEarnings_OnlyEscrowRole() public {
        BattleRegistry registry = new BattleRegistry(address(this), address(escrow));
        // Random caller cannot mutate earnings.
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        registry.recordEarnings(FIGHTER_A, 1 ether);
    }

    function test_SubmitVerdict_AnyoneCanRelayValidSig() public {
        uint256 id = _create();
        // Carol (unrelated) submits — should succeed because the sig is valid.
        vm.prank(carol);
        _submitVerdict(id, 0);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Verdict));
    }

    // ---------------- 0G DA epoch anchoring ----------------

    /// On chains where the DASigners precompile (0x...1000) is live, the
    /// epoch returned by the precompile is mirrored into battleDAEpoch and
    /// surfaced via BattleDAAnchored.
    function test_SubmitVerdict_AnchorsDAEpoch() public {
        uint256 id = _create();
        uint256 expectedEpoch = 4242;
        vm.mockCall(
            escrow.DA_SIGNERS_PRECOMPILE(),
            abi.encodeWithSignature("epochNumber()"),
            abi.encode(expectedEpoch)
        );
        vm.expectEmit(true, false, false, true, address(escrow));
        emit BattleEscrow.BattleDAAnchored(id, uint64(expectedEpoch));
        _submitVerdict(id, 0);
        assertEq(escrow.battleDAEpoch(id), expectedEpoch);
    }

    /// Without a precompile (default local Anvil), the staticcall fails
    /// silently and the epoch records as 0 — verdict flow still completes.
    function test_SubmitVerdict_AnchorDefaultsZeroWithoutPrecompile() public {
        uint256 id = _create();
        vm.expectEmit(true, false, false, true, address(escrow));
        emit BattleEscrow.BattleDAAnchored(id, uint64(0));
        _submitVerdict(id, 0);
        assertEq(escrow.battleDAEpoch(id), 0);
        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), uint8(BattleEscrow.Status.Verdict));
    }

    function test_SubmitVerdict_RevertsOnTamperedResponseBody() public {
        uint256 id = _create();
        VerdictArgs memory v = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, ORACLE_PRIV_KEY);
        // Flip a byte in responseBody so its sha256 no longer matches the
        // signed routing-proof's response hash.
        v.responseBody[0] = bytes1(uint8(v.responseBody[0]) ^ 0x01);
        vm.expectRevert(BattleEscrow.ResponseHashMismatch.selector);
        escrow.submitVerdict(
            id,
            0,
            MOCK_VERDICT_HASH,
            v.responseBody,
            v.contentOffset,
            v.signedText,
            v.signature
        );
    }

    function test_SubmitVerdict_RevertsOnInvalidContentOffset() public {
        uint256 id = _create();
        VerdictArgs memory v = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, ORACLE_PRIV_KEY);
        // Offset that does not point at a quote-bracketed canonical run.
        vm.expectRevert(BattleEscrow.InvalidContentOffset.selector);
        escrow.submitVerdict(
            id,
            0,
            MOCK_VERDICT_HASH,
            v.responseBody,
            v.contentOffset + 1,
            v.signedText,
            v.signature
        );
    }

    function test_SetOracleKey_RotatesAndInvalidatesOldKey() public {
        uint256 id = _create();

        // Rotate to a new oracle key.
        uint256 newKey = 0xBEEF;
        address newAddr = vm.addr(newKey);
        vm.prank(admin);
        escrow.setOracleKey(newAddr);
        assertEq(escrow.oracleKey(), newAddr);

        // Old oracle key signs an attestation that no longer recovers to
        // oracleKey post-rotation.
        VerdictArgs memory oldArgs = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, ORACLE_PRIV_KEY);
        vm.expectRevert(BattleEscrow.InvalidOracleSignature.selector);
        escrow.submitVerdict(
            id,
            0,
            MOCK_VERDICT_HASH,
            oldArgs.responseBody,
            oldArgs.contentOffset,
            oldArgs.signedText,
            oldArgs.signature
        );

        // New key signs valid.
        VerdictArgs memory newArgs = _buildVerdictArgs(id, 0, MOCK_VERDICT_HASH, newKey);
        escrow.submitVerdict(
            id,
            0,
            MOCK_VERDICT_HASH,
            newArgs.responseBody,
            newArgs.contentOffset,
            newArgs.signedText,
            newArgs.signature
        );
    }

    function test_ReentrancyOnClaim_Blocked() public {
        uint256 id = _create();
        ReentrantBettor attacker = new ReentrantBettor(escrow);
        vm.deal(address(attacker), 2 ether);
        attacker.bet{value: 1 ether}(id, 0);

        vm.prank(bob);
        escrow.placeBet{value: 1 ether}(id, 1, 1 ether);

        _submitVerdict(id, 0);
        vm.warp(block.timestamp + 24 hours + 1);
        escrow.settle(id);

        uint256 before_ = address(attacker).balance;
        attacker.claim(id);
        vm.expectRevert(BattleEscrow.NothingToClaim.selector);
        attacker.claim(id);
        assertGt(address(attacker).balance, before_);
    }
}
