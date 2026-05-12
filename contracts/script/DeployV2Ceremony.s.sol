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
///                               RUNNER_ROLE on YapFighter at deploy time
///                               so the yap-web server can emit
///                               PersonaAccessed via logAccess(). Skipped
///                               cleanly when unset (admin can grantRole
///                               later).
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
    bytes32 public constant SALT_YAP_FIGHTER = keccak256("yap:YapFighter:v2");
    bytes32 public constant SALT_BATTLE_ESCROW = keccak256("yap:BattleEscrow:v2");
    bytes32 public constant SALT_BATTLE_REGISTRY = keccak256("yap:BattleRegistry:v2");
    bytes32 public constant SALT_MARKETPLACE_FIGHTER = keccak256("yap:YapMarketplace:v2");
    bytes32 public constant SALT_MARKETPLACE_MOMENT = keccak256("yap:MomentMarketplace:v2");
    bytes32 public constant SALT_RENTAL_ESCROW = keccak256("yap:RentalEscrow:v2");
    bytes32 public constant SALT_SUBNAME_REGISTRAR = keccak256("yap:YapSubnameRegistrar:v2");
    bytes32 public constant SALT_MOMENT_INFT = keccak256("yap:MomentINFT:v2");

    struct Deployments {
        YapFighter fighter;
        BattleEscrow escrow;
        BattleRegistry registry;
        YapMarketplace fighterMarket;
        RentalEscrow rental;
        YapSubnameRegistrar subname;
        MomentINFT moment;
        YapMarketplace momentMarket;
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
        console2.log("[1/9] YapFighter v2:         ", address(d.fighter));

        // ── 2. BattleEscrow v2 ───────────────────────────────────────────
        d.escrow = new BattleEscrow{salt: SALT_BATTLE_ESCROW}(
            admin, treasury, teeOracle, address(d.fighter)
        );
        console2.log("[2/9] BattleEscrow v2:       ", address(d.escrow));

        // ── 3. BattleRegistry v2 (fresh deploy — code changed for v3) ───
        // Constructor grants ESCROW_ROLE to the escrow address inline,
        // so no post-deploy role wiring is needed for the registry side.
        d.registry = new BattleRegistry{salt: SALT_BATTLE_REGISTRY}(
            admin, address(d.escrow)
        );
        console2.log("[3/9] BattleRegistry v2:     ", address(d.registry));

        // ── 4. YapMarketplace v2 (fighter instance) ─────────────────────
        d.fighterMarket = new YapMarketplace{salt: SALT_MARKETPLACE_FIGHTER}(
            address(d.fighter), admin, treasury
        );
        console2.log("[4/9] YapMarketplace v2:     ", address(d.fighterMarket));

        // ── 5. RentalEscrow v2 ──────────────────────────────────────────
        d.rental = new RentalEscrow{salt: SALT_RENTAL_ESCROW}(
            address(d.fighter), admin, treasury
        );
        console2.log("[5/9] RentalEscrow v2:       ", address(d.rental));

        // ── 6. YapSubnameRegistrar v2 ───────────────────────────────────
        d.subname = new YapSubnameRegistrar{salt: SALT_SUBNAME_REGISTRAR}(
            address(d.fighter), admin, treasury
        );
        console2.log("[6/9] YapSubnameRegistrar v2:", address(d.subname));

        // ── 7. MomentINFT v2 ────────────────────────────────────────────
        d.moment = new MomentINFT{salt: SALT_MOMENT_INFT}(
            admin,
            verifier,
            treasury,
            address(d.escrow),
            address(d.fighter),
            momentMintFee
        );
        console2.log("[7/9] MomentINFT v2:         ", address(d.moment));

        // ── 8. YapMarketplace v2 (moment instance) ──────────────────────
        d.momentMarket = new YapMarketplace{salt: SALT_MARKETPLACE_MOMENT}(
            address(d.moment), admin, treasury
        );
        console2.log("[8/9] MomentMarketplace v2:  ", address(d.momentMarket));

        // ── 9. Wire + role grants ───────────────────────────────────────
        // Wire BattleEscrow v2 → BattleRegistry v2 so settle() routes
        // finalizeBattle + recordEarnings to the registry.
        d.escrow.setRegistry(address(d.registry));
        console2.log("[9/9] BattleEscrow.setRegistry done");

        // Grant RUNNER_ROLE on YapFighter to the server-side runner so the
        // yap-web inference API route can emit PersonaAccessed on every
        // round. Admin (deployer) holds DEFAULT_ADMIN_ROLE here at
        // construction time, so the grant is in-broadcast.
        if (runner != address(0)) {
            d.fighter.grantRole(d.fighter.RUNNER_ROLE(), runner);
            console2.log("      RUNNER_ROLE granted on YapFighter to:", runner);
        } else {
            console2.log("      RUNNER_ROLE grant SKIPPED (YAP_RUNNER unset)");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== v2 cascade complete ===");
        console2.log("Copy these into apps/web/.env.local (NEXT_PUBLIC_*_ADDR_TESTNET):");
        console2.log("YAP_FIGHTER          ", address(d.fighter));
        console2.log("BATTLE_ESCROW        ", address(d.escrow));
        console2.log("BATTLE_REGISTRY      ", address(d.registry));
        console2.log("MARKETPLACE          ", address(d.fighterMarket));
        console2.log("RENTAL_ESCROW        ", address(d.rental));
        console2.log("YAP_SUBNAME          ", address(d.subname));
        console2.log("MOMENT_INFT          ", address(d.moment));
        console2.log("MOMENT_MARKET        ", address(d.momentMarket));
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
