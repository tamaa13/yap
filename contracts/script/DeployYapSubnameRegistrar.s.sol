// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YapSubnameRegistrar} from "../src/YapSubnameRegistrar.sol";

/// @notice CREATE2 deploy of YapSubnameRegistrar against an
///         already-deployed YapFighter. Same deployer + salt + bytecode
///         + constructor args = same address across testnet/mainnet.
///
/// Env vars:
///   - PRIVATE_KEY  (required) deployer key
///   - YAP_FIGHTER  (required) live YapFighter address
///   - YAP_ADMIN    (optional, default = deployer)
///   - YAP_TREASURY (optional, default = deployer)
///
/// Run:
///   forge script script/DeployYapSubnameRegistrar.s.sol:DeployYapSubnameRegistrar \
///     --rpc-url zg_testnet --broadcast --evm-version cancun
contract DeployYapSubnameRegistrar is Script {
    bytes32 public constant SALT = keccak256("yap:YapSubnameRegistrar:v1");

    function run() external returns (YapSubnameRegistrar registrar) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address fighter = vm.envAddress("YAP_FIGHTER");
        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);

        bytes memory args = abi.encode(fighter, admin, treasury);
        bytes memory creationCode = abi.encodePacked(
            type(YapSubnameRegistrar).creationCode,
            args
        );
        bytes32 codeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(SALT, codeHash);
        console2.log("predicted address:", predicted);

        vm.startBroadcast(pk);
        registrar = new YapSubnameRegistrar{salt: SALT}(fighter, admin, treasury);
        vm.stopBroadcast();

        require(address(registrar) == predicted, "CREATE2 address mismatch");

        console2.log("YapSubnameRegistrar deployed:", address(registrar));
        console2.log("salt:                        ", vm.toString(SALT));
        console2.log("fighter:                     ", fighter);
        console2.log("admin:                       ", admin);
        console2.log("treasury:                    ", treasury);
        console2.log("chainId:                     ", block.chainid);
    }

    function _envAddrOr(string memory key, address fallback_) internal view returns (address) {
        try vm.envAddress(key) returns (address a) {
            return a;
        } catch {
            return fallback_;
        }
    }
}
