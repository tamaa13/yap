// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";

/// @title  RunMainnetE2ECycle — minimal-burn variant of RunE2ECycle for
///         Aristotle mainnet smoke-testing.
/// @notice Drops the separate spectator wallet (broker doubles as the
///         side-A bettor by piling on after createBattle) and uses the
///         RUNNER wallet as defender (it already has gas from the M2
///         funding step). Total pool drops to 0.011 OG, total burn
///         including gas + funding is ≈0.05 OG per PM target.
///
///         Otherwise identical flow to the testnet script:
///         mint(broker) → mint(runner) → logAccess → createBattle →
///         acceptBattle → placeBet → setOracleKey(broker) →
///         submitVerdict → setDisputeWindow filler → settle →
///         restore oracle + window → claimPayout.
///
/// Env vars:
///   - PRIVATE_KEY            (required) broker / deployer / admin /
///                            treasury / fighter A owner / spectator
///   - RUNNER_KEY             (required) defender / fighter B owner;
///                            already RUNNER_ROLE-granted on mainnet
///                            via the deploy ceremony, so it can also
///                            call logAccess.
///   - YAP_FIGHTER            (required) mainnet v3 deployment
///   - YAP_BATTLE_ESCROW      (required)
///   - YAP_BATTLE_REGISTRY    (required)
///
/// Run (mainnet):
///   forge script script/RunMainnetE2ECycle.s.sol:RunMainnetE2ECycle \
///     --rpc-url https://evmrpc.0g.ai \
///     --broadcast --skip-simulation \
///     --legacy --priority-gas-price 2000000000 \
///     --evm-version cancun
contract RunMainnetE2ECycle is Script {
    using MessageHashUtils for bytes32;

    YapFighter fighter;
    BattleEscrow escrow;
    BattleRegistry registry;

    uint256 brokerKey;
    uint256 runnerKey;
    address broker;
    address runner;

    struct VerdictArgs {
        bytes responseBody;
        uint256 contentOffset;
        bytes signedText;
        bytes signature;
    }

    function run() external {
        brokerKey = vm.envUint("PRIVATE_KEY");
        runnerKey = vm.envUint("RUNNER_KEY");
        broker = vm.addr(brokerKey);
        runner = vm.addr(runnerKey);

        fighter = YapFighter(vm.envAddress("YAP_FIGHTER"));
        escrow = BattleEscrow(payable(vm.envAddress("YAP_BATTLE_ESCROW")));
        registry = BattleRegistry(vm.envAddress("YAP_BATTLE_REGISTRY"));

        console2.log("=== Mainnet E2E (minimal burn) ===");
        console2.log("broker:    ", broker);
        console2.log("runner:    ", runner);
        console2.log("fighter:   ", address(fighter));
        console2.log("escrow:    ", address(escrow));
        console2.log("registry:  ", address(registry));
        console2.log("runner bal:", runner.balance);

        // ── Phase 1: Mint fighters ───────────────────────────────────────
        vm.startBroadcast(brokerKey);
        uint256 fighterA = fighter.mint(
            broker, "ipfs://main-e2e-A", keccak256("main-e2e-A"), hex"01",
            YapFighter.Archetype.Roaster, keccak256("main-seed-A")
        );
        vm.stopBroadcast();
        console2.log("[P1] fighterA tokenId =", fighterA);

        vm.startBroadcast(runnerKey);
        uint256 fighterB = fighter.mint(
            runner, "ipfs://main-e2e-B", keccak256("main-e2e-B"), hex"02",
            YapFighter.Archetype.Debater, keccak256("main-seed-B")
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

        // ── Phase 3a: Battle setup (smaller stakes) ──────────────────────
        vm.startBroadcast(brokerKey);
        uint256 battleId = escrow.createBattle{value: 0.005 ether}(
            fighterA, fighterB, "mainnet: cereal soup", 3
        );
        vm.stopBroadcast();
        console2.log("[P3] battleId =", battleId);

        vm.startBroadcast(runnerKey);
        escrow.acceptBattle{value: 0.005 ether}(battleId);
        vm.stopBroadcast();

        // Broker doubles as side-A spectator — add 0.001 more to existing
        // side-A bet (challenger stake is already on side A).
        vm.startBroadcast(brokerKey);
        escrow.placeBet{value: 0.001 ether}(battleId, 0, 0.001 ether);
        vm.stopBroadcast();
        console2.log("[P3] pools: A=0.006, B=0.005, total=0.011 OG");

        // ── Phase 3b: Rotate oracle key + shorten dispute window ─────────
        address originalOracle = escrow.oracleKey();
        uint256 originalWindow = escrow.disputeWindow();
        vm.startBroadcast(brokerKey);
        escrow.setOracleKey(broker);
        escrow.setDisputeWindow(1);
        vm.stopBroadcast();
        console2.log("[P3] oracleKey temporarily set to broker");

        // ── Phase 3c: Build + submit verdict ─────────────────────────────
        bytes32 verdictHash = keccak256("main-e2e-transcript");
        VerdictArgs memory v = _buildVerdictArgs(battleId, 0, verdictHash, brokerKey);
        vm.startBroadcast(brokerKey);
        escrow.submitVerdict(
            battleId, 0, verdictHash,
            v.responseBody, v.contentOffset, v.signedText, v.signature
        );
        vm.stopBroadcast();
        console2.log("[P3] submitVerdict sent (winner=A)");

        // Filler tx forces a block between submitVerdict and settle.
        vm.startBroadcast(brokerKey);
        escrow.setDisputeWindow(1);
        vm.stopBroadcast();

        // Sim-only warp; real chain has block-time gap.
        vm.warp(block.timestamp + 5);

        // ── Phase 3d: Settle ─────────────────────────────────────────────
        uint256 brokerBalPreSettle = broker.balance;
        vm.startBroadcast(brokerKey);
        escrow.settle(battleId);
        vm.stopBroadcast();

        // ── Restore IMMEDIATELY after settle ─────────────────────────────
        vm.startBroadcast(brokerKey);
        escrow.setOracleKey(originalOracle);
        escrow.setDisputeWindow(originalWindow);
        vm.stopBroadcast();
        console2.log("[P3] oracleKey + disputeWindow restored");

        // ── Phase 3 verification ─────────────────────────────────────────
        BattleEscrow.Battle memory b = escrow.getBattle(battleId);
        console2.log("[P3] feeCollected =", b.feeCollected);
        console2.log("[P3] royaltyPaid  =", b.royaltyPaid);
        console2.log("[P3] broker balance delta from settle =",
            int256(broker.balance) - int256(brokerBalPreSettle));
        (uint32 elo, uint32 wins, uint32 losses, uint256 earnings)
            = registry.fighterStats(fighterA);
        console2.log("[P3] registry stats(A) elo/wins/losses =", elo, wins, losses);
        console2.log("[P3] registry stats(A) earnings =", earnings);

        // ── Phase 4: Broker (side-A bettor) claim ────────────────────────
        uint256 brokerPre = broker.balance;
        vm.startBroadcast(brokerKey);
        escrow.claimPayout(battleId);
        vm.stopBroadcast();
        console2.log("[P4] broker bettor claim delta =",
            int256(broker.balance) - int256(brokerPre));

        console2.log("=== Mainnet E2E complete ===");
    }

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
        bytes32 dummyReqSha = keccak256("main-e2e-req");
        bytes32 dummyTlsFp = keccak256("main-e2e-tls");
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
