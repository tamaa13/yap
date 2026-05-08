// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {FighterTrainer} from "../src/FighterTrainer.sol";

/// @notice Deploys FighterTrainer wired to an existing YapFighter.
///
/// Env vars:
///   - PRIVATE_KEY      (required) deployer key
///   - YAP_FIGHTER      (required) address of the deployed YapFighter
contract DeployFighterTrainer is Script {
    function run() external returns (FighterTrainer trainer) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address yapFighter = vm.envAddress("YAP_FIGHTER");
        require(yapFighter != address(0), "YAP_FIGHTER required");

        vm.startBroadcast(pk);
        trainer = new FighterTrainer(yapFighter);
        vm.stopBroadcast();

        console2.log("FighterTrainer:", address(trainer));
        console2.log("  yapFighter:", yapFighter);
    }
}
