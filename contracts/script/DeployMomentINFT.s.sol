// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MomentINFT} from "../src/MomentINFT.sol";

/// @notice CREATE2 deploy of MomentINFT against an already-deployed
///         BattleEscrow + YapFighter. Same deployer + salt + bytecode
///         + constructor args = same address across testnet/mainnet.
///
/// Env vars:
///   - PRIVATE_KEY         (required) deployer key
///   - YAP_FIGHTER         (required) live YapFighter address
///   - YAP_BATTLE_ESCROW   (required) live BattleEscrow address
///   - YAP_ADMIN           (optional, default = deployer)
///   - YAP_VERIFIER        (optional, default = deployer)
///   - YAP_TREASURY        (optional, default = deployer)
///   - YAP_MOMENT_MINT_FEE (optional, default = 0) wei
///
/// Run:
///   forge script script/DeployMomentINFT.s.sol:DeployMomentINFT \
///     --rpc-url zg_testnet --broadcast --evm-version cancun
contract DeployMomentINFT is Script {
    bytes32 public constant SALT = keccak256("yap:MomentINFT:v1");

    function run() external returns (MomentINFT moment) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address fighter = vm.envAddress("YAP_FIGHTER");
        address escrow = vm.envAddress("YAP_BATTLE_ESCROW");
        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address verifier = _envAddrOr("YAP_VERIFIER", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);
        uint256 mintFee = _envUintOr("YAP_MOMENT_MINT_FEE", 0);

        bytes memory args = abi.encode(admin, verifier, treasury, escrow, fighter, mintFee);
        bytes memory creationCode = abi.encodePacked(type(MomentINFT).creationCode, args);
        bytes32 codeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(SALT, codeHash);
        console2.log("predicted address:", predicted);

        vm.startBroadcast(pk);
        moment = new MomentINFT{salt: SALT}(
            admin,
            verifier,
            treasury,
            escrow,
            fighter,
            mintFee
        );
        vm.stopBroadcast();

        require(address(moment) == predicted, "CREATE2 address mismatch");

        console2.log("MomentINFT deployed:", address(moment));
        console2.log("salt:               ", vm.toString(SALT));
        console2.log("escrow:             ", escrow);
        console2.log("fighter:            ", fighter);
        console2.log("admin:              ", admin);
        console2.log("verifier:           ", verifier);
        console2.log("treasury:           ", treasury);
        console2.log("mintFee (wei):      ", mintFee);
        console2.log("chainId:            ", block.chainid);
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
