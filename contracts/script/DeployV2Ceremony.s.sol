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

/// @title  DeployV2Ceremony — Strategy A full-cascade v2 redeploy.
/// @notice Atomic ceremony script — deploys YapFighter v2, then every
///         consumer that holds it as an `immutable fighterContract`, then
///         rotates the existing BattleRegistry's ESCROW_ROLE to point at
///         the new BattleEscrow. Everything inside one
///         {vm.startBroadcast} so the same nonce sequence produces
///         predictable CREATE2 addresses on testnet AND mainnet (same
///         deployer + same salts + same bytecode).
///
///         BattleRegistry is kept alive at its v1 address — only the
///         ESCROW_ROLE is granted to the new escrow. The deployer must
///         hold {BattleRegistry.ADMIN_ROLE} on the existing registry
///         (true if the deployer is the same address that ran v1
///         {Deploy.s.sol}). If admin has been rotated, granting the role
///         will revert and the entire broadcast aborts — re-run with the
///         current admin key.
///
/// Env vars:
///   - PRIVATE_KEY               (required) deployer (must hold registry ADMIN_ROLE)
///   - YAP_BATTLE_REGISTRY_V1    (required) existing BattleRegistry address
///                                          (kept across the ceremony)
///   - YAP_ADMIN                 (optional, default = deployer)
///   - YAP_TREASURY              (optional, default = deployer)
///   - YAP_VERIFIER              (optional, default = deployer)
///   - YAP_TEE_ORACLE            (optional, default = deployer) — oracleKey
///                               for BattleEscrow v2; production = TEE signer
///                               of the pinned 0G Compute provider
///   - YAP_MINT_FEE              (optional, default = 0) wei — fighter mint fee
///   - YAP_MOMENT_MINT_FEE       (optional, default = 0) wei
///   - REVOKE_V1_ESCROW_ROLE     (optional, "true") revoke v1 escrow role
///                                                  on the kept registry
///   - YAP_BATTLE_ESCROW_V1      (required if REVOKE_V1_ESCROW_ROLE=true)
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
    bytes32 public constant SALT_YAP_FIGHTER = keccak256("yap:YapFighter:v2");
    bytes32 public constant SALT_BATTLE_ESCROW = keccak256("yap:BattleEscrow:v2");
    bytes32 public constant SALT_MARKETPLACE_FIGHTER = keccak256("yap:YapMarketplace:v2");
    bytes32 public constant SALT_MARKETPLACE_MOMENT = keccak256("yap:MomentMarketplace:v2");
    bytes32 public constant SALT_RENTAL_ESCROW = keccak256("yap:RentalEscrow:v2");
    bytes32 public constant SALT_SUBNAME_REGISTRAR = keccak256("yap:YapSubnameRegistrar:v2");
    bytes32 public constant SALT_MOMENT_INFT = keccak256("yap:MomentINFT:v2");

    struct Deployments {
        YapFighter fighter;
        BattleEscrow escrow;
        YapMarketplace fighterMarket;
        RentalEscrow rental;
        YapSubnameRegistrar subname;
        MomentINFT moment;
        YapMarketplace momentMarket;
    }

    function run() external returns (Deployments memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address registryV1 = vm.envAddress("YAP_BATTLE_REGISTRY_V1");
        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);
        address verifier = _envAddrOr("YAP_VERIFIER", deployer);
        address teeOracle = _envAddrOr("YAP_TEE_ORACLE", deployer);
        uint256 mintFee = _envUintOr("YAP_MINT_FEE", 0);
        uint256 momentMintFee = _envUintOr("YAP_MOMENT_MINT_FEE", 0);

        console2.log("=== Ceremony pre-flight ===");
        console2.log("deployer:    ", deployer);
        console2.log("admin:       ", admin);
        console2.log("treasury:    ", treasury);
        console2.log("verifier:    ", verifier);
        console2.log("teeOracle:   ", teeOracle);
        console2.log("registry v1: ", registryV1);
        console2.log("chainId:     ", block.chainid);

        vm.startBroadcast(pk);

        // ── 1. YapFighter v2 ─────────────────────────────────────────────
        d.fighter = new YapFighter{salt: SALT_YAP_FIGHTER}(
            admin, verifier, treasury, mintFee
        );
        console2.log("[1/8] YapFighter v2:        ", address(d.fighter));

        // ── 2. BattleEscrow v2 ───────────────────────────────────────────
        d.escrow = new BattleEscrow{salt: SALT_BATTLE_ESCROW}(
            admin, treasury, teeOracle, address(d.fighter)
        );
        console2.log("[2/8] BattleEscrow v2:      ", address(d.escrow));

        // ── 3. YapMarketplace v2 (fighter instance) ─────────────────────
        d.fighterMarket = new YapMarketplace{salt: SALT_MARKETPLACE_FIGHTER}(
            address(d.fighter), admin, treasury
        );
        console2.log("[3/8] YapMarketplace v2:    ", address(d.fighterMarket));

        // ── 4. RentalEscrow v2 ──────────────────────────────────────────
        d.rental = new RentalEscrow{salt: SALT_RENTAL_ESCROW}(
            address(d.fighter), admin, treasury
        );
        console2.log("[4/8] RentalEscrow v2:      ", address(d.rental));

        // ── 5. YapSubnameRegistrar v2 ───────────────────────────────────
        d.subname = new YapSubnameRegistrar{salt: SALT_SUBNAME_REGISTRAR}(
            address(d.fighter), admin, treasury
        );
        console2.log("[5/8] YapSubnameRegistrar v2:", address(d.subname));

        // ── 6. MomentINFT v2 ────────────────────────────────────────────
        d.moment = new MomentINFT{salt: SALT_MOMENT_INFT}(
            admin,
            verifier,
            treasury,
            address(d.escrow),
            address(d.fighter),
            momentMintFee
        );
        console2.log("[6/8] MomentINFT v2:        ", address(d.moment));

        // ── 7. YapMarketplace v2 (moment instance) ──────────────────────
        d.momentMarket = new YapMarketplace{salt: SALT_MARKETPLACE_MOMENT}(
            address(d.moment), admin, treasury
        );
        console2.log("[7/8] MomentMarketplace v2: ", address(d.momentMarket));

        // ── 8. Wire BattleRegistry v1 → BattleEscrow v2 ─────────────────
        BattleRegistry registry = BattleRegistry(registryV1);
        registry.setEscrow(address(d.escrow));
        console2.log("[8/8] BattleRegistry ESCROW_ROLE rotated to escrow v2");

        // Wire BattleEscrow v2 → BattleRegistry (mirror of v1 Deploy.s.sol wiring).
        d.escrow.setRegistry(registryV1);
        console2.log("      BattleEscrow.setRegistry done");

        // Optional cleanup — revoke ESCROW_ROLE from the abandoned v1 escrow
        // so dormant contracts can't accidentally hit a finalizeBattle path.
        if (_envBoolOr("REVOKE_V1_ESCROW_ROLE", false)) {
            address oldEscrow = vm.envAddress("YAP_BATTLE_ESCROW_V1");
            registry.revokeRole(registry.ESCROW_ROLE(), oldEscrow);
            console2.log("      revoked ESCROW_ROLE from v1 escrow:", oldEscrow);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== v2 cascade complete ===");
        console2.log("Copy these into apps/web/.env.local (NEXT_PUBLIC_*_ADDR_TESTNET):");
        console2.log("YAP_FIGHTER         ", address(d.fighter));
        console2.log("BATTLE_ESCROW       ", address(d.escrow));
        console2.log("BATTLE_REGISTRY     ", registryV1, "(unchanged)");
        console2.log("MARKETPLACE         ", address(d.fighterMarket));
        console2.log("RENTAL_ESCROW       ", address(d.rental));
        console2.log("YAP_SUBNAME         ", address(d.subname));
        console2.log("MOMENT_INFT         ", address(d.moment));
        console2.log("MOMENT_MARKET       ", address(d.momentMarket));
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

    function _envBoolOr(string memory key, bool fallback_) internal view returns (bool) {
        try vm.envBool(key) returns (bool v) {
            return v;
        } catch {
            return fallback_;
        }
    }
}
