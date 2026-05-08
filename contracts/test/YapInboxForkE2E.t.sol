// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapInbox} from "../src/YapInbox.sol";

/// @notice Fork-test for YapInbox against the live Galileo deploy.
///         Deployed via CREATE2 with salt keccak256("yap:YapInbox:v1"),
///         so the same address resolves on mainnet once that deploy lands.
///
/// Run with:
///   forge test --match-contract YapInboxForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract YapInboxForkE2ETest is Test {
    YapInbox internal inbox;

    address constant INBOX_ADDR = 0xe92dB21A770c32a19795556C46D5c6a274955DBD;

    address internal alice = makeAddr("inbox-alice");
    address internal bob = makeAddr("inbox-bob");

    function setUp() public {
        inbox = YapInbox(INBOX_ADDR);
        // Sanity: contract is reachable + the constant matches.
        assertEq(inbox.MAX_INLINE_PAYLOAD(), 16 * 1024, "MAX_INLINE_PAYLOAD drifted");
    }

    function test_LiveContract_AcceptsInlineMessage() public {
        bytes memory payload = abi.encodePacked("hello-fork-", block.chainid);
        vm.expectEmit(true, true, false, true, INBOX_ADDR);
        emit YapInbox.Message(alice, bob, payload, bytes32(0));

        vm.prank(alice);
        inbox.sendMessage(bob, payload, bytes32(0));
    }

    function test_LiveContract_AcceptsStorageHash() public {
        bytes32 hash = keccak256("0g-storage-blob-fork");
        vm.prank(alice);
        inbox.sendMessage(bob, hex"", hash);
    }

    function test_LiveContract_RevertsOnEmptyMessage() public {
        vm.prank(alice);
        vm.expectRevert(YapInbox.EmptyMessage.selector);
        inbox.sendMessage(bob, hex"", bytes32(0));
    }

    function test_LiveContract_RevertsOnZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(YapInbox.InvalidRecipient.selector);
        inbox.sendMessage(address(0), hex"01", bytes32(0));
    }

    function test_LiveContract_RevertsOnOversizedPayload() public {
        bytes memory huge = new bytes(inbox.MAX_INLINE_PAYLOAD() + 1);
        vm.prank(alice);
        vm.expectRevert(YapInbox.PayloadTooLarge.selector);
        inbox.sendMessage(bob, huge, bytes32(0));
    }
}
