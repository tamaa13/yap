// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

/// @notice Deploys YapFighter + BattleEscrow + BattleRegistry + YapMarketplace + RentalEscrow
///         and wires them.
///
/// Env vars:
///   - PRIVATE_KEY            (required) deployer key
///   - YAP_ADMIN              (optional, default = deployer) DEFAULT_ADMIN_ROLE + ADMIN_ROLE holder
///   - YAP_TREASURY           (optional, default = deployer) platform fee sink
///   - YAP_VERIFIER           (optional, default = deployer) ERC-7857 proof verifier
///   - YAP_TEE_ORACLE         (optional, default = deployer) verdict submitter
///   - YAP_MINT_FEE           (optional, default = 0)        wei
contract Deploy is Script {
    function run()
        external
        returns (
            YapFighter fighter,
            BattleEscrow escrow,
            BattleRegistry registry,
            YapMarketplace marketplace,
            RentalEscrow rental
        )
    {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);
        address verifier = _envAddrOr("YAP_VERIFIER", deployer);
        address teeOracle = _envAddrOr("YAP_TEE_ORACLE", deployer);
        uint256 mintFee = _envUintOr("YAP_MINT_FEE", 0);

        vm.startBroadcast(pk);

        fighter = new YapFighter(admin, verifier, treasury, mintFee);
        escrow = new BattleEscrow(admin, treasury, teeOracle, address(fighter));
        registry = new BattleRegistry(admin, address(escrow));
        marketplace = new YapMarketplace(address(fighter), admin, treasury);
        rental = new RentalEscrow(address(fighter), admin, treasury);

        // Wire escrow ↔ registry.
        escrow.setRegistry(address(registry));

        vm.stopBroadcast();

        console2.log("YapFighter     ", address(fighter));
        console2.log("BattleEscrow   ", address(escrow));
        console2.log("BattleRegistry ", address(registry));
        console2.log("YapMarketplace ", address(marketplace));
        console2.log("RentalEscrow   ", address(rental));
        console2.log("admin          ", admin);
        console2.log("treasury       ", treasury);
        console2.log("verifier       ", verifier);
        console2.log("teeOracle      ", teeOracle);
        console2.log("mintFee (wei)  ", mintFee);
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
