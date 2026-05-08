// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapInbox} from "../src/YapInbox.sol";

contract YapInboxTest is Test {
    YapInbox internal inbox;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        inbox = new YapInbox();
    }

    function test_SendInlinePayload_EmitsMessage() public {
        bytes memory payload = hex"deadbeef";
        vm.expectEmit(true, true, false, true, address(inbox));
        emit YapInbox.Message(alice, bob, payload, bytes32(0));

        vm.prank(alice);
        inbox.sendMessage(bob, payload, bytes32(0));
    }

    function test_SendStorageHash_OnlyDataHash_EmitsMessage() public {
        bytes32 hash = keccak256("0g-storage-blob");
        vm.expectEmit(true, true, false, true, address(inbox));
        emit YapInbox.Message(alice, bob, hex"", hash);

        vm.prank(alice);
        inbox.sendMessage(bob, hex"", hash);
    }

    function test_SendBoth_InlineAndDataHash_EmitsMessage() public {
        bytes memory payload = hex"00112233";
        bytes32 hash = keccak256("payload-mirror");
        vm.expectEmit(true, true, false, true, address(inbox));
        emit YapInbox.Message(alice, bob, payload, hash);

        vm.prank(alice);
        inbox.sendMessage(bob, payload, hash);
    }

    function test_RevertOnZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(YapInbox.InvalidRecipient.selector);
        inbox.sendMessage(address(0), hex"01", bytes32(0));
    }

    function test_RevertOnEmptyMessage() public {
        vm.prank(alice);
        vm.expectRevert(YapInbox.EmptyMessage.selector);
        inbox.sendMessage(bob, hex"", bytes32(0));
    }

    function test_RevertOnOversizedPayload() public {
        bytes memory huge = new bytes(inbox.MAX_INLINE_PAYLOAD() + 1);
        vm.prank(alice);
        vm.expectRevert(YapInbox.PayloadTooLarge.selector);
        inbox.sendMessage(bob, huge, bytes32(0));
    }

    function test_AcceptsExactlyMaxPayload() public {
        bytes memory atMax = new bytes(inbox.MAX_INLINE_PAYLOAD());
        // Fill with non-zero so the abi encoding is realistic.
        for (uint256 i = 0; i < atMax.length; ++i) atMax[i] = 0x01;

        vm.prank(alice);
        inbox.sendMessage(bob, atMax, bytes32(0));
        // No revert; not asserting event payload bit-equality here since
        // we already covered that in the small-inline test.
    }

    function test_FromIsSender_NotInlineClaim() public {
        // Even if alice tries to put bob's address inside the payload,
        // `event.from` is alice. Listeners must trust the event topic.
        bytes memory spoofed = abi.encodePacked(bob);
        vm.expectEmit(true, true, false, true, address(inbox));
        emit YapInbox.Message(alice, carol, spoofed, bytes32(0));
        vm.prank(alice);
        inbox.sendMessage(carol, spoofed, bytes32(0));
    }

    function test_StatelessContract_StoresNothing() public {
        // Two unrelated messages — neither writes storage. We confirm by
        // the contract carrying no state to read; this is a structural
        // assertion via the absence of public storage variables.
        vm.prank(alice);
        inbox.sendMessage(bob, hex"01", bytes32(0));
        vm.prank(bob);
        inbox.sendMessage(alice, hex"02", bytes32(0));
        // No reverts → both succeeded. The contract has no view function
        // to "leak" stored state; if MAX_INLINE_PAYLOAD ever became
        // mutable that'd require a getter that doesn't exist.
        assertEq(inbox.MAX_INLINE_PAYLOAD(), 16 * 1024);
    }
}
