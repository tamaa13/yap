// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";
import {MomentINFT} from "../src/MomentINFT.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {YapSubnameRegistrar} from "../src/YapSubnameRegistrar.sol";
import {AbilityEscrow} from "../src/AbilityEscrow.sol";

/// @title  DeployV2Ceremony — Strategy A full-cascade v2 redeploy.
/// @notice Atomic ceremony script — deploys YapFighter, BattleEscrow,
///         BattleRegistry (fresh — v3 added a recordEarnings function),
///         the two marketplace instances (fighter + moment), RentalEscrow,
///         YapSubnameRegistrar, and MomentINFT. Everything inside one
///         {vm.startBroadcast} so the same nonce sequence produces
///         predictable CREATE2 addresses on testnet AND mainnet (same
///         deployer + same salts + same bytecode).
///
///         The v1 ecosystem (fighters minted, subnames registered,
///         rentals/listings) is orphaned by design — Strategy A trades
///         continuity for feature parity. v1 contracts remain on chain
///         but no UI surface routes through them after this ceremony.
///
/// Env vars:
///   - PRIVATE_KEY               (required) deployer
///   - YAP_ADMIN                 (optional, default = deployer) DEFAULT_ADMIN_ROLE holder
///   - YAP_TREASURY              (optional, default = deployer)
///   - YAP_VERIFIER              (optional, default = deployer)
///   - YAP_TEE_ORACLE            (optional, default = deployer) — oracleKey
///                               for BattleEscrow v2; production = TEE signer
///                               of the pinned 0G Compute provider
///   - YAP_RUNNER                (optional, default = unset)   — granted
///                               RUNNER_ROLE on YapFighter at deploy time.
///                               Single grant covers both PersonaAccessed
///                               emission (logAccess) and persona scoring
///                               (recordMintScores). Skipped cleanly when
///                               unset (admin can grantRole later).
///   - YAP_SCORE_ORACLE          (optional, default = unset) — set as
///                               YapFighter.scoreOracleKey at deploy time.
///                               The teeSignerAddress whose attestations
///                               recordMintScores verifies. Skipped cleanly
///                               when unset (admin can setScoreOracleKey).
///   - YAP_MINT_FEE              (optional, default = 0) wei — fighter mint fee
///   - YAP_MOMENT_MINT_FEE       (optional, default = 0) wei
///
/// Run (Galileo testnet):
///   forge script script/DeployV2Ceremony.s.sol:DeployV2Ceremony \
///     --rpc-url zg_testnet \
///     --broadcast \
///     --legacy --priority-gas-price 2000000000 \
///     --evm-version cancun
///
/// Run (Aristotle mainnet):
///   Replace --rpc-url zg_testnet with --rpc-url zg_mainnet. Same script,
///   same salts, same bytecode → same addresses across both chains
///   provided the deployer + ctor args match.
contract DeployV2Ceremony is Script {
    // Salts bump to :v3 for this ceremony — the prior v2 cascade is
    // already on chain at the :v2 salts' CREATE2 addresses; reusing
    // them with new bytecode would still produce different addresses
    // (CREATE2 hashes both salt and initcode), but the explicit version
    // bump keeps the on-chain history readable and avoids accidental
    // collision if anyone replays an old script.
    bytes32 public constant SALT_YAP_FIGHTER = keccak256("yap:YapFighter:v3");
    bytes32 public constant SALT_BATTLE_ESCROW = keccak256("yap:BattleEscrow:v3");
    bytes32 public constant SALT_BATTLE_REGISTRY = keccak256("yap:BattleRegistry:v3");
    bytes32 public constant SALT_MARKETPLACE_FIGHTER = keccak256("yap:YapMarketplace:v3");
    bytes32 public constant SALT_MARKETPLACE_MOMENT = keccak256("yap:MomentMarketplace:v3");
    bytes32 public constant SALT_RENTAL_ESCROW = keccak256("yap:RentalEscrow:v3");
    bytes32 public constant SALT_SUBNAME_REGISTRAR = keccak256("yap:YapSubnameRegistrar:v3");
    bytes32 public constant SALT_MOMENT_INFT = keccak256("yap:MomentINFT:v3");
    bytes32 public constant SALT_ABILITY_ESCROW = keccak256("yap:AbilityEscrow:v3");

    struct Deployments {
        YapFighter fighter;
        BattleEscrow escrow;
        BattleRegistry registry;
        YapMarketplace fighterMarket;
        RentalEscrow rental;
        YapSubnameRegistrar subname;
        MomentINFT moment;
        YapMarketplace momentMarket;
        AbilityEscrow ability;
    }

    function run() external returns (Deployments memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);
        address verifier = _envAddrOr("YAP_VERIFIER", deployer);
        address teeOracle = _envAddrOr("YAP_TEE_ORACLE", deployer);
        address runner = _envAddrOr("YAP_RUNNER", address(0));
        uint256 mintFee = _envUintOr("YAP_MINT_FEE", 0);
        uint256 momentMintFee = _envUintOr("YAP_MOMENT_MINT_FEE", 0);

        console2.log("=== Ceremony pre-flight ===");
        console2.log("deployer:    ", deployer);
        console2.log("admin:       ", admin);
        console2.log("treasury:    ", treasury);
        console2.log("verifier:    ", verifier);
        console2.log("teeOracle:   ", teeOracle);
        console2.log("runner:      ", runner);
        console2.log("chainId:     ", block.chainid);

        vm.startBroadcast(pk);

        // ── 1. YapFighter v2 ─────────────────────────────────────────────
        d.fighter = new YapFighter{salt: SALT_YAP_FIGHTER}(
            admin, verifier, treasury, mintFee
        );
        console2.log("[1/10] YapFighter v3:         ", address(d.fighter));

        // ── 2. BattleEscrow v2 ───────────────────────────────────────────
        d.escrow = new BattleEscrow{salt: SALT_BATTLE_ESCROW}(
            admin, treasury, teeOracle, address(d.fighter)
        );
        console2.log("[2/10] BattleEscrow v3:       ", address(d.escrow));

        // ── 3. BattleRegistry v2 (fresh deploy — code changed for v3) ───
        // Constructor grants ESCROW_ROLE to the escrow address inline,
        // so no post-deploy role wiring is needed for the registry side.
        d.registry = new BattleRegistry{salt: SALT_BATTLE_REGISTRY}(
            admin, address(d.escrow)
        );
        console2.log("[3/10] BattleRegistry v3:     ", address(d.registry));

        // ── 4. YapMarketplace v2 (fighter instance) ─────────────────────
        d.fighterMarket = new YapMarketplace{salt: SALT_MARKETPLACE_FIGHTER}(
            address(d.fighter), admin, treasury
        );
        console2.log("[4/10] YapMarketplace v3:     ", address(d.fighterMarket));

        // ── 5. RentalEscrow v2 ──────────────────────────────────────────
        d.rental = new RentalEscrow{salt: SALT_RENTAL_ESCROW}(
            address(d.fighter), admin, treasury
        );
        console2.log("[5/10] RentalEscrow v3:       ", address(d.rental));

        // ── 6. YapSubnameRegistrar v2 ───────────────────────────────────
        d.subname = new YapSubnameRegistrar{salt: SALT_SUBNAME_REGISTRAR}(
            address(d.fighter), admin, treasury
        );
        console2.log("[6/10] YapSubnameRegistrar v3:", address(d.subname));

        // ── 7. MomentINFT v2 ────────────────────────────────────────────
        d.moment = new MomentINFT{salt: SALT_MOMENT_INFT}(
            admin,
            verifier,
            treasury,
            address(d.escrow),
            address(d.fighter),
            momentMintFee
        );
        console2.log("[7/10] MomentINFT v3:         ", address(d.moment));

        // ── 8. YapMarketplace v3 (moment instance) ──────────────────────
        d.momentMarket = new YapMarketplace{salt: SALT_MARKETPLACE_MOMENT}(
            address(d.moment), admin, treasury
        );
        console2.log("[8/10] MomentMarketplace v3: ", address(d.momentMarket));

        // ── 9. AbilityEscrow v3 — sidecar gating archetype abilities ────
        //      Reads BattleEscrow + YapFighter at use-time; no value flow.
        d.ability = new AbilityEscrow{salt: SALT_ABILITY_ESCROW}(
            address(d.escrow), address(d.fighter), admin
        );
        console2.log("[9/10] AbilityEscrow v3:     ", address(d.ability));

        // ── 10. Wire + role grants ──────────────────────────────────────
        // Wire BattleEscrow v3 → BattleRegistry v3 so settle() routes
        // finalizeBattle + recordEarnings to the registry.
        d.escrow.setRegistry(address(d.registry));
        console2.log("[10/10] BattleEscrow.setRegistry done");

        // Grant RUNNER_ROLE on YapFighter to the server-side runner. The
        // same wallet acts as both PersonaAccessed emitter and the
        // recordMintScores caller (per the locked v3 design), so a single
        // grant covers both paths. If YAP_SCORE_ORACLE is set, also wire
        // setScoreOracleKey so recordMintScores can verify attestations.
        if (runner != address(0)) {
            d.fighter.grantRole(d.fighter.RUNNER_ROLE(), runner);
            console2.log("      RUNNER_ROLE granted on YapFighter to:", runner);
        } else {
            console2.log("      RUNNER_ROLE grant SKIPPED (YAP_RUNNER unset)");
        }
        address scoreOracle = _envAddrOr("YAP_SCORE_ORACLE", address(0));
        if (scoreOracle != address(0)) {
            d.fighter.setScoreOracleKey(scoreOracle);
            console2.log("      scoreOracleKey set on YapFighter to:", scoreOracle);
        } else {
            console2.log("      scoreOracleKey SKIPPED (YAP_SCORE_ORACLE unset)");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== v3 cascade complete ===");
        console2.log("Copy these into apps/web/.env.local (NEXT_PUBLIC_*_ADDR_TESTNET):");
        console2.log("YAP_FIGHTER          ", address(d.fighter));
        console2.log("BATTLE_ESCROW        ", address(d.escrow));
        console2.log("BATTLE_REGISTRY      ", address(d.registry));
        console2.log("MARKETPLACE          ", address(d.fighterMarket));
        console2.log("RENTAL_ESCROW        ", address(d.rental));
        console2.log("YAP_SUBNAME          ", address(d.subname));
        console2.log("MOMENT_INFT          ", address(d.moment));
        console2.log("MOMENT_MARKET        ", address(d.momentMarket));
        console2.log("ABILITY_ESCROW       ", address(d.ability));
    }

    function _envAddrOr(string memory key, address fallback_) internal view returns (address) {
        try vm.envAddress(key) returns (address a) {
            return a;
        } catch {
            return fallback_;
        }
    }

    function _envUintOr(string memory key, uint256 fallback_) internal view returns (uint256) {
        try vm.envUint(key) returns (uint256 v) {
            return v;
        } catch {
            return fallback_;
        }
    }
}
