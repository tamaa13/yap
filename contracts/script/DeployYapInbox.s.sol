// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YapInbox} from "../src/YapInbox.sol";

/// @notice CREATE2 deploy of YapInbox so testnet (Galileo) and mainnet
///         (Aristotle) end up at the SAME contract address. Same
///         deployer + same salt + same bytecode = same address — agents
///         and frontends can hardcode the singleton without env-specific
///         wiring.
///
/// Run testnet:
///   PRIVATE_KEY=$DEPLOYER_PK forge script \
///     contracts/script/DeployYapInbox.s.sol:DeployYapInbox \
///     --rpc-url https://evmrpc-testnet.0g.ai --broadcast
///
/// Run mainnet (same address as testnet):
///   PRIVATE_KEY=$DEPLOYER_PK forge script \
///     contracts/script/DeployYapInbox.s.sol:DeployYapInbox \
///     --rpc-url https://evmrpc.0g.ai --broadcast
contract DeployYapInbox is Script {
    /// @dev Stable salt — bumping the suffix forces a new address. Keep
    ///      this constant across redeploys until the bytecode changes.
    bytes32 public constant SALT = keccak256("yap:YapInbox:v1");

    function run() external returns (YapInbox inbox) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        // Predict the address before broadcasting so the deployer can
        // validate (and so a CREATE2 collision shows up loudly).
        bytes memory creationCode = type(YapInbox).creationCode;
        bytes32 codeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(SALT, codeHash);
        console2.log("predicted address:", predicted);

        vm.startBroadcast(pk);
        inbox = new YapInbox{salt: SALT}();
        vm.stopBroadcast();

        require(address(inbox) == predicted, "CREATE2 address mismatch");

        console2.log("YapInbox deployed:", address(inbox));
        console2.log("salt:             ", vm.toString(SALT));
        console2.log("chainId:          ", block.chainid);
    }
}
