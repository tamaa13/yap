// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";

/// @title  RunE2ECycle — programmatic mint → battle → settle → claim on live chain.
/// @notice One-shot end-to-end exerciser for the v3 cascade. Mints two
///         fighters, logs a runner access, creates + accepts + bets on a
///         battle, temporarily rotates the oracle key (we don't hold the
///         real TEE signer's privkey on this machine) to sign a verdict
///         with the broker key, submits the verdict, settles, claims, and
///         restores the oracle key + dispute window in the same broadcast.
///
///         The at-risk window (test oracle key live on chain) is just the
///         submitVerdict + settle pair — restored on the next tx.
///
/// Env vars:
///   - PRIVATE_KEY            (required) deployer / admin / broker
///   - DEFENDER_KEY           (required) holds fighterB + accepts battle
///   - SPECTATOR_KEY          (required) places a side-A bet
///   - RUNNER_KEY             (required) calls logAccess (RUNNER_ROLE)
///   - YAP_FIGHTER            (required) v2 deployment
///   - YAP_BATTLE_ESCROW      (required) v2 deployment
///   - YAP_BATTLE_REGISTRY    (required) v2 deployment
///
/// Run (Galileo testnet):
///   forge script script/RunE2ECycle.s.sol:RunE2ECycle \
///     --rpc-url https://evmrpc-testnet.0g.ai \
///     --broadcast \
///     --legacy --priority-gas-price 2000000000 \
///     --evm-version cancun
contract RunE2ECycle is Script {
    using MessageHashUtils for bytes32;

    YapFighter fighter;
    BattleEscrow escrow;
    BattleRegistry registry;

    uint256 brokerKey;
    uint256 defenderKey;
    uint256 spectatorKey;
    uint256 runnerKey;
    address broker;
    address defender;
    address spectator;
    address runner;

    struct VerdictArgs {
        bytes responseBody;
        uint256 contentOffset;
        bytes signedText;
        bytes signature;
    }

    function run() external {
        brokerKey = vm.envUint("PRIVATE_KEY");
        defenderKey = vm.envUint("DEFENDER_KEY");
        spectatorKey = vm.envUint("SPECTATOR_KEY");
        runnerKey = vm.envUint("RUNNER_KEY");
        broker = vm.addr(brokerKey);
        defender = vm.addr(defenderKey);
        spectator = vm.addr(spectatorKey);
        runner = vm.addr(runnerKey);

        fighter = YapFighter(vm.envAddress("YAP_FIGHTER"));
        escrow = BattleEscrow(payable(vm.envAddress("YAP_BATTLE_ESCROW")));
        registry = BattleRegistry(vm.envAddress("YAP_BATTLE_REGISTRY"));

        console2.log("=== E2E cycle ===");
        console2.log("broker:    ", broker);
        console2.log("defender:  ", defender);
        console2.log("spectator: ", spectator);
        console2.log("runner:    ", runner);

        // ── Fund defender + spectator (one-time per script run) ──────────
        vm.startBroadcast(brokerKey);
        if (defender.balance < 0.02 ether) {
            (bool d, ) = payable(defender).call{value: 0.03 ether}("");
            require(d, "fund defender failed");
        }
        if (spectator.balance < 0.02 ether) {
            (bool s, ) = payable(spectator).call{value: 0.03 ether}("");
            require(s, "fund spectator failed");
        }
        vm.stopBroadcast();
        console2.log("defender bal:  ", defender.balance);
        console2.log("spectator bal: ", spectator.balance);

        // ── Phase 1: Mint fighters ───────────────────────────────────────
        vm.startBroadcast(brokerKey);
        uint256 fighterA = fighter.mint(
            broker, "ipfs://e2e-fighterA", keccak256("e2e-A"), hex"01"
        );
        vm.stopBroadcast();
        console2.log("[P1] fighterA tokenId =", fighterA);

        vm.startBroadcast(defenderKey);
        uint256 fighterB = fighter.mint(
            defender, "ipfs://e2e-fighterB", keccak256("e2e-B"), hex"02"
        );
        vm.stopBroadcast();
        console2.log("[P1] fighterB tokenId =", fighterB);

        // ── Phase 2: logAccess (RUNNER_ROLE path) ────────────────────────
        uint256 accBefore = fighter.getAccessCount(fighterA);
        vm.startBroadcast(runnerKey);
        fighter.logAccess(fighterA, 0);
        vm.stopBroadcast();
        uint256 accAfter = fighter.getAccessCount(fighterA);
        console2.log("[P2] accessCount before/after:", accBefore, accAfter);
        require(accAfter == accBefore + 1, "logAccess did not increment");

        // ── Phase 3a: Battle setup ───────────────────────────────────────
        vm.startBroadcast(brokerKey);
        uint256 battleId = escrow.createBattle{value: 0.01 ether}(
            fighterA, fighterB, "e2e: cereal soup", 3
        );
        vm.stopBroadcast();
        console2.log("[P3] battleId =", battleId);

        vm.startBroadcast(defenderKey);
        escrow.acceptBattle{value: 0.01 ether}(battleId);
        vm.stopBroadcast();

        vm.startBroadcast(spectatorKey);
        escrow.placeBet{value: 0.005 ether}(battleId, 0, 0.005 ether);
        vm.stopBroadcast();
        console2.log("[P3] pools: A=0.015, B=0.010, total=0.025");

        // ── Phase 3b: Rotate oracle key + shorten dispute window ─────────
        address originalOracle = escrow.oracleKey();
        uint256 originalWindow = escrow.disputeWindow();
        vm.startBroadcast(brokerKey);
        escrow.setOracleKey(broker);
        escrow.setDisputeWindow(1);
        vm.stopBroadcast();
        console2.log("[P3] oracleKey temporarily set to broker");

        // ── Phase 3c: Build + submit verdict ─────────────────────────────
        bytes32 verdictHash = keccak256("e2e-test-transcript");
        VerdictArgs memory v = _buildVerdictArgs(battleId, 0, verdictHash, brokerKey);
        vm.startBroadcast(brokerKey);
        escrow.submitVerdict(
            battleId, 0, verdictHash,
            v.responseBody, v.contentOffset, v.signedText, v.signature
        );
        vm.stopBroadcast();
        console2.log("[P3] submitVerdict sent (winner=A)");

        // Filler tx — guarantees at least one extra block between
        // submitVerdict and settle so the 1-second disputeWindow elapses
        // even on a fast Galileo block. We re-set disputeWindow to the
        // same value, a no-op write that just costs a block of time.
        vm.startBroadcast(brokerKey);
        escrow.setDisputeWindow(1);
        vm.stopBroadcast();

        // During Foundry's local simulation pass, block.timestamp doesn't
        // advance between vm.startBroadcast frames. Warp it forward so the
        // sim's settle() doesn't trip the dispute-window check. On the
        // live broadcast pass, txs land in separate blocks ~1-2s apart so
        // the on-chain dispute window elapses naturally. vm.warp only
        // affects the local sim, never the broadcast.
        vm.warp(block.timestamp + 5);

        // ── Phase 3d: Settle (block.timestamp advances enough between txs) ─
        uint256 brokerBalPreSettle = broker.balance;
        vm.startBroadcast(brokerKey);
        escrow.settle(battleId);
        vm.stopBroadcast();

        // ── Restore IMMEDIATELY after settle (close at-risk window) ──────
        vm.startBroadcast(brokerKey);
        escrow.setOracleKey(originalOracle);
        escrow.setDisputeWindow(originalWindow);
        vm.stopBroadcast();
        console2.log("[P3] oracleKey + disputeWindow restored");

        // ── Phase 3 verification ─────────────────────────────────────────
        BattleEscrow.Battle memory b = escrow.getBattle(battleId);
        console2.log("[P3] feeCollected =", b.feeCollected);
        console2.log("[P3] royaltyPaid  =", b.royaltyPaid);
        // brokerBalPreSettle was sampled BEFORE settle + restore. Royalty
        // arrived inside settle; restore + claimPayout (Phase 4) come
        // after this delta is taken.
        console2.log("[P3] broker balance delta from settle =",
            int256(broker.balance) - int256(brokerBalPreSettle));
        (uint32 elo, uint32 wins, uint32 losses, uint256 earnings)
            = registry.fighterStats(fighterA);
        console2.log("[P3] registry stats(A): elo/wins/losses =", elo, wins, losses);
        console2.log("[P3] registry stats(A): earnings =", earnings);

        // ── Phase 4: Spectator claim ─────────────────────────────────────
        uint256 spectatorPre = spectator.balance;
        vm.startBroadcast(spectatorKey);
        escrow.claimPayout(battleId);
        vm.stopBroadcast();
        console2.log("[P4] spectator balance delta =",
            int256(spectator.balance) - int256(spectatorPre));

        console2.log("=== E2E cycle complete ===");
    }

    /// Mirror of the test helper {BattleEscrowTest._buildVerdictArgs} —
    /// constructs a {"content":"<canonical>"}-shaped responseBody, the
    /// routing-proof signedText (<reqSha>:<respSha>:test:test:<tlsSha>),
    /// and an EIP-191 personal-sign of signedText by `signerPk`. Result
    /// passes the live BattleEscrow's verdict verification when oracleKey
    /// is set to vm.addr(signerPk).
    function _buildVerdictArgs(
        uint256 battleId,
        uint8 winner,
        bytes32 verdictHash,
        uint256 signerPk
    ) internal view returns (VerdictArgs memory args) {
        bytes memory canonical = bytes(
            escrow.verdictCanonicalText(battleId, winner, verdictHash)
        );
        args.responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        args.contentOffset = 12;

        bytes32 respSha = sha256(args.responseBody);
        bytes32 dummyReqSha = keccak256("e2e-req");
        bytes32 dummyTlsFp = keccak256("e2e-tls");
        args.signedText = abi.encodePacked(
            _bytes32Hex(dummyReqSha), ":", _bytes32Hex(respSha),
            ":test:test:", _bytes32Hex(dummyTlsFp)
        );

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(args.signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        args.signature = abi.encodePacked(r, s, vv);
    }

    function _bytes32Hex(bytes32 bb) internal pure returns (bytes memory) {
        bytes memory withPrefix = bytes(Strings.toHexString(uint256(bb), 32));
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 64; ++i) out[i] = withPrefix[i + 2];
        return out;
    }
}
