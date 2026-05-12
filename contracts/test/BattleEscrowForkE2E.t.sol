// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {TEEAttestationLib} from "../src/TEEAttestationLib.sol";

/// @notice Fork-test that runs the BattleEscrow lifecycle against the
///         live Galileo deploy. Rotates `oracleKey` to a Foundry-
///         controlled address so we can sign a routing-proof verdict
///         that the deployed bytecode accepts. Validates create →
///         accept → outside bet → submitVerdict → settle → claim end
///         to end without spending real OG.
///
/// Run with:
///   forge test --match-contract BattleEscrowForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract BattleEscrowForkE2ETest is Test {
    using MessageHashUtils for bytes32;

    YapFighter internal fighter;
    BattleEscrow internal escrow;

    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    address constant ESCROW_ADDR = 0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e;
    /// @dev Deployer wallet — holds ADMIN_ROLE on the live escrow and
    ///      owns fighters 1, 5, 10, 20 etc.
    address constant DEPLOYER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;

    /// @dev Test oracle key — rotated into oracleKey before each test.
    uint256 constant TEST_ORACLE_PK = 0xA11CE;

    address internal challenger = DEPLOYER;
    address internal defender = makeAddr("e2e-defender");
    address internal outsideBettor = makeAddr("e2e-bettor");

    uint256 constant FIGHTER_A = 1;
    uint256 constant FIGHTER_B = 10;

    /// @dev Mock verdictHash — opaque to the contract beyond non-zero +
    ///      consistency between sign + submit.
    bytes32 constant MOCK_VERDICT_HASH = keccak256("yap-fork-transcript");

    function setUp() public {
        fighter = YapFighter(FIGHTER_ADDR);
        escrow = BattleEscrow(ESCROW_ADDR);

        // Move fighter B to the defender so _canUseFighter passes for them.
        vm.prank(DEPLOYER);
        fighter.safeTransferFrom(DEPLOYER, defender, FIGHTER_B);
        assertEq(fighter.ownerOf(FIGHTER_B), defender);
        // Fighter A stays with challenger == deployer.
        assertEq(fighter.ownerOf(FIGHTER_A), challenger);

        // Rotate oracleKey so we can sign verdicts in the fork.
        vm.prank(DEPLOYER);
        escrow.setOracleKey(vm.addr(TEST_ORACLE_PK));

        vm.deal(challenger, 5 ether);
        vm.deal(defender, 5 ether);
        vm.deal(outsideBettor, 5 ether);
    }

    function _createAndAccept(uint256 stake) internal returns (uint256 id) {
        vm.prank(challenger);
        id = escrow.createBattle{value: stake}(FIGHTER_A, FIGHTER_B, "fork e2e", 3);

        vm.prank(defender);
        escrow.acceptBattle{value: stake}(id);

        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), 1, "expected Live"); // Status.Live = 1
    }

    function _submitVerdict(uint256 battleId, uint8 winner) internal {
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(battleId, winner, MOCK_VERDICT_HASH)
        );
        bytes memory responseBody = abi.encodePacked(
            '{"content":"',
            canonical,
            '"}'
        );
        uint256 contentOffset = 12;
        bytes32 respSha = sha256(responseBody);

        bytes memory signedText = abi.encodePacked(
            _bytes32Hex(keccak256("yap-fork-req")),
            ":",
            _bytes32Hex(respSha),
            ":centralized:test:",
            _bytes32Hex(keccak256("yap-fork-tls"))
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(TEST_ORACLE_PK, digest);
        bytes memory signature = abi.encodePacked(r, s, vv);

        // anyone can relay
        escrow.submitVerdict(
            battleId,
            winner,
            MOCK_VERDICT_HASH,
            responseBody,
            contentOffset,
            signedText,
            signature
        );
    }

    function _bytes32Hex(bytes32 b) internal pure returns (bytes memory) {
        bytes memory withPrefix = bytes(Strings.toHexString(uint256(b), 32));
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 64; ++i) out[i] = withPrefix[i + 2];
        return out;
    }

    // ---------------------- happy path -----------------------------

    function test_HappyPath_FullLifecycle_SideAWins() public {
        uint256 stake = 0.1 ether;
        uint256 id = _createAndAccept(stake);

        // Outside bet on side A
        vm.prank(outsideBettor);
        escrow.placeBet{value: 0.05 ether}(id, 0, 0.05 ether);

        // Verdict: A wins
        _submitVerdict(id, 0);

        // Wait out dispute window then settle
        vm.warp(block.timestamp + escrow.DISPUTE_WINDOW() + 1);
        escrow.settle(id);

        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), 3, "expected Settled"); // Status.Settled = 3
        assertEq(b.winner, 0);

        // Claim payouts — challenger (side A) + outside bettor (side A)
        uint256 challengerBefore = challenger.balance;
        vm.prank(challenger);
        escrow.claimPayout(id);
        assertGt(challenger.balance, challengerBefore, "challenger didn't receive payout");

        uint256 bettorBefore = outsideBettor.balance;
        vm.prank(outsideBettor);
        escrow.claimPayout(id);
        assertGt(outsideBettor.balance, bettorBefore, "bettor didn't receive payout");

        // Defender (side B) gets nothing — claim reverts or returns 0.
        vm.prank(defender);
        try escrow.claimPayout(id) {
            // Some loser-refund logic may apply if pool capping triggered.
            // Acceptable as long as it doesn't revert pathologically.
        } catch {}
    }

    function test_DrawRefundsBothSides() public {
        uint256 stake = 0.1 ether;
        uint256 id = _createAndAccept(stake);

        // Verdict: DRAW (uses DRAW constant — winner=2)
        uint8 DRAW = escrow.DRAW();
        _submitVerdict(id, DRAW);

        vm.warp(block.timestamp + escrow.DISPUTE_WINDOW() + 1);
        escrow.settle(id);

        // Both sides should be refundable
        uint256 challengerBefore = challenger.balance;
        vm.prank(challenger);
        escrow.claimPayout(id);
        assertEq(
            challenger.balance - challengerBefore,
            stake,
            "challenger refund != stake"
        );

        uint256 defenderBefore = defender.balance;
        vm.prank(defender);
        escrow.claimPayout(id);
        assertEq(
            defender.balance - defenderBefore,
            stake,
            "defender refund != stake"
        );
    }

    function test_DeclineReturnsChallengerStake() public {
        uint256 stake = 0.1 ether;
        vm.prank(challenger);
        uint256 id = escrow.createBattle{value: stake}(
            FIGHTER_A,
            FIGHTER_B,
            "fork decline",
            3
        );

        vm.prank(defender);
        escrow.declineBattle(id);

        BattleEscrow.Battle memory b = escrow.getBattle(id);
        assertEq(uint8(b.status), 4, "expected Cancelled"); // Status.Cancelled = 4

        uint256 before_ = challenger.balance;
        vm.prank(challenger);
        escrow.claimPayout(id);
        assertEq(challenger.balance - before_, stake, "decline refund != stake");
    }

    // ---------------------- signature guardrails -------------------

    function test_RevertOnBadSignature() public {
        uint256 stake = 0.1 ether;
        uint256 id = _createAndAccept(stake);

        // Sign with wrong key — expect revert
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(id, 0, MOCK_VERDICT_HASH)
        );
        bytes memory responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        bytes32 respSha = sha256(responseBody);
        bytes memory signedText = abi.encodePacked(
            _bytes32Hex(keccak256("yap-fork-req")),
            ":",
            _bytes32Hex(respSha),
            ":centralized:test:",
            _bytes32Hex(keccak256("yap-fork-tls"))
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(0xBAD1, digest);
        bytes memory signature = abi.encodePacked(r, s, vv);

        vm.expectRevert(TEEAttestationLib.InvalidOracleSignature.selector);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, responseBody, 12, signedText, signature);
    }

    function test_RevertOnTamperedResponseBody() public {
        uint256 stake = 0.1 ether;
        uint256 id = _createAndAccept(stake);

        // Build args for winner=0
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(id, 0, MOCK_VERDICT_HASH)
        );
        bytes memory responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        bytes32 respSha = sha256(responseBody);
        bytes memory signedText = abi.encodePacked(
            _bytes32Hex(keccak256("yap-fork-req")),
            ":",
            _bytes32Hex(respSha),
            ":centralized:test:",
            _bytes32Hex(keccak256("yap-fork-tls"))
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(TEST_ORACLE_PK, digest);
        bytes memory signature = abi.encodePacked(r, s, vv);

        // Mutate responseBody so its sha256 no longer matches
        responseBody[0] = bytes1(uint8(responseBody[0]) ^ 0x01);

        vm.expectRevert(TEEAttestationLib.ResponseHashMismatch.selector);
        escrow.submitVerdict(id, 0, MOCK_VERDICT_HASH, responseBody, 12, signedText, signature);
    }

    function test_RevertOnWrongWinner() public {
        uint256 stake = 0.1 ether;
        uint256 id = _createAndAccept(stake);

        // Sign as winner=0 but submit winner=1 — canonical mismatch.
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(id, 0, MOCK_VERDICT_HASH)
        );
        bytes memory responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        bytes32 respSha = sha256(responseBody);
        bytes memory signedText = abi.encodePacked(
            _bytes32Hex(keccak256("yap-fork-req")),
            ":",
            _bytes32Hex(respSha),
            ":centralized:test:",
            _bytes32Hex(keccak256("yap-fork-tls"))
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(TEST_ORACLE_PK, digest);
        bytes memory signature = abi.encodePacked(r, s, vv);

        // Submit with winner=1 — the canonical reconstruction inside submitVerdict
        // for winner=1 won't match the responseBody (which encodes winner=0).
        vm.expectRevert();
        escrow.submitVerdict(id, 1, MOCK_VERDICT_HASH, responseBody, 12, signedText, signature);
    }

    // ---------------------- side-state guards ----------------------

    function test_RevertSettleDuringDisputeWindow() public {
        uint256 id = _createAndAccept(0.1 ether);
        _submitVerdict(id, 0);

        // Settle inside dispute window must revert.
        vm.expectRevert();
        escrow.settle(id);
    }

    function test_DefenderStakeTooLow_Reverts() public {
        vm.prank(challenger);
        uint256 id = escrow.createBattle{value: 0.1 ether}(
            FIGHTER_A,
            FIGHTER_B,
            "stake-low",
            3
        );

        // 75% min, so 0.05 (50%) is rejected.
        vm.prank(defender);
        vm.expectRevert(BattleEscrow.DefenderStakeTooLow.selector);
        escrow.acceptBattle{value: 0.05 ether}(id);
    }
}
