// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

/// @notice Standalone deploy of RentalEscrow against an already-deployed YapFighter.
///
/// Env vars:
///   - PRIVATE_KEY       (required) deployer key
///   - YAP_FIGHTER       (required) address of an existing YapFighter
///   - YAP_ADMIN         (optional, default = deployer)
///   - YAP_TREASURY      (optional, default = deployer)
contract DeployRentalEscrow is Script {
    function run() external returns (RentalEscrow rental) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address fighter = vm.envAddress("YAP_FIGHTER");
        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);

        vm.startBroadcast(pk);
        rental = new RentalEscrow(fighter, admin, treasury);
        vm.stopBroadcast();

        console2.log("RentalEscrow   ", address(rental));
        console2.log("fighter        ", fighter);
        console2.log("admin          ", admin);
        console2.log("treasury       ", treasury);
    }

    function _envAddrOr(string memory key, address fallback_) internal view returns (address) {
        try vm.envAddress(key) returns (address a) {
            return a;
        } catch {
            return fallback_;
        }
    }
}
