// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";

/// @notice Standalone deploy of a SECOND YapMarketplace instance pointed
///         at MomentINFT. Reuses YapMarketplace bytecode unchanged — the
///         contract's `fighterContract` is `immutable`, so the moment
///         marketplace and the fighter marketplace are independent
///         instances of the same code.
///
/// Env vars:
///   - PRIVATE_KEY     (required) deployer key
///   - YAP_MOMENT_INFT (required) MomentINFT address (the target NFT)
///   - YAP_ADMIN       (optional, default = deployer)
///   - YAP_TREASURY    (optional, default = deployer)
///
/// Run:
///   forge script script/DeployMomentMarketplace.s.sol:DeployMomentMarketplace \
///     --rpc-url zg_testnet --broadcast --evm-version cancun
contract DeployMomentMarketplace is Script {
    bytes32 public constant SALT = keccak256("yap:MomentMarketplace:v1");

    function run() external returns (YapMarketplace marketplace) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address momentInft = vm.envAddress("YAP_MOMENT_INFT");
        address admin = _envAddrOr("YAP_ADMIN", deployer);
        address treasury = _envAddrOr("YAP_TREASURY", deployer);

        bytes memory args = abi.encode(momentInft, admin, treasury);
        bytes memory creationCode = abi.encodePacked(type(YapMarketplace).creationCode, args);
        bytes32 codeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(SALT, codeHash);
        console2.log("predicted address:", predicted);

        vm.startBroadcast(pk);
        marketplace = new YapMarketplace{salt: SALT}(momentInft, admin, treasury);
        vm.stopBroadcast();

        require(address(marketplace) == predicted, "CREATE2 address mismatch");

        console2.log("MomentMarketplace deployed:", address(marketplace));
        console2.log("salt:                      ", vm.toString(SALT));
        console2.log("nft (MomentINFT):          ", momentInft);
        console2.log("admin:                     ", admin);
        console2.log("treasury:                  ", treasury);
        console2.log("chainId:                   ", block.chainid);
    }

    function _envAddrOr(string memory key, address fallback_) internal view returns (address) {
        try vm.envAddress(key) returns (address a) {
            return a;
        } catch {
            return fallback_;
        }
    }
}
