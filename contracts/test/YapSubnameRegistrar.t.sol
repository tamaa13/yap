// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapSubnameRegistrar} from "../src/YapSubnameRegistrar.sol";
import {YapFighter} from "../src/YapFighter.sol";

contract YapSubnameRegistrarTest is Test {
    YapSubnameRegistrar internal registrar;
    YapFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, 0);
        registrar = new YapSubnameRegistrar(address(fighter), admin, treasury);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ---------------- helpers ----------------

    function _mint(address to) internal returns (uint256 id) {
        vm.prank(to);
        id = fighter.mint(to, "ipfs://x", keccak256(abi.encodePacked(to)), hex"01");
    }

    // ---------------- register ----------------

    function test_Register_Succeeds_BindsBothMaps() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("alice", id);
        assertEq(registrar.tokenIdOf("alice"), id);
        assertEq(registrar.labelOf(id), "alice");
    }

    function test_Register_EmitsEvent() public {
        uint256 id = _mint(alice);
        bytes32 labelHash = keccak256(bytes("alice"));
        vm.expectEmit(true, true, true, true);
        emit YapSubnameRegistrar.SubnameRegistered(id, labelHash, alice, "alice");
        vm.prank(alice);
        registrar.register("alice", id);
    }

    function test_Register_RevertsForNonFighterOwner() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(YapSubnameRegistrar.NotFighterOwner.selector);
        registrar.register("bob", id);
    }

    function test_Register_RevertsOnDuplicateLabel() public {
        uint256 idA = _mint(alice);
        uint256 idB = _mint(bob);
        vm.prank(alice);
        registrar.register("rare", idA);
        vm.prank(bob);
        vm.expectRevert(YapSubnameRegistrar.LabelAlreadyTaken.selector);
        registrar.register("rare", idB);
    }

    function test_Register_RevertsOnDuplicateTokenId() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        registrar.register("first", id);
        vm.expectRevert(YapSubnameRegistrar.TokenAlreadyHasLabel.selector);
        registrar.register("second", id);
        vm.stopPrank();
    }

    function test_Register_RevertsOnLabelTooShort() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelTooShort.selector);
        registrar.register("ab", id);
    }

    function test_Register_RevertsOnLabelTooLong() public {
        uint256 id = _mint(alice);
        // 33-char label.
        string memory longLabel = "abcdefghijklmnopqrstuvwxyz0123456";
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelTooLong.selector);
        registrar.register(longLabel, id);
    }

    function test_Register_RevertsOnInvalidChar() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelInvalidChar.selector);
        registrar.register("Alice", id); // uppercase A
    }

    function test_Register_RevertsOnUnderscore() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelInvalidChar.selector);
        registrar.register("a_b", id);
    }

    function test_Register_RevertsOnLeadingHyphen() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelHasLeadingHyphen.selector);
        registrar.register("-bob", id);
    }

    function test_Register_RevertsOnTrailingHyphen() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.LabelHasTrailingHyphen.selector);
        registrar.register("bob-", id);
    }

    function test_Register_AcceptsHyphenInMiddle() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("a-b", id);
        assertEq(registrar.tokenIdOf("a-b"), id);
    }

    function test_Register_AcceptsDigits() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("alice7", id);
        assertEq(registrar.tokenIdOf("alice7"), id);
    }

    function test_Register_RevertsOnIncorrectFee() public {
        vm.prank(admin);
        registrar.setRegisterFee(0.01 ether);
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.IncorrectFee.selector);
        registrar.register("alice", id);
    }

    function test_Register_ForwardsFeeToTreasury() public {
        vm.prank(admin);
        registrar.setRegisterFee(0.05 ether);
        uint256 id = _mint(alice);
        uint256 before = treasury.balance;
        vm.prank(alice);
        registrar.register{value: 0.05 ether}("alice", id);
        assertEq(treasury.balance - before, 0.05 ether);
    }

    // ---------------- release ----------------

    function test_Release_FreesBothMappings() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        registrar.register("alice", id);
        registrar.release(id);
        vm.stopPrank();
        assertEq(registrar.tokenIdOf("alice"), 0);
        assertEq(registrar.labelOf(id), "");
        assertTrue(registrar.isAvailable("alice"));
    }

    function test_Release_RevertsForNonOwner() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("alice", id);
        vm.prank(bob);
        vm.expectRevert(YapSubnameRegistrar.NotFighterOwner.selector);
        registrar.release(id);
    }

    function test_Release_RevertsWhenNoLabel() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(YapSubnameRegistrar.NoLabel.selector);
        registrar.release(id);
    }

    function test_Release_AllowsRebinding() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        registrar.register("alice", id);
        registrar.release(id);
        registrar.register("alice", id); // re-register same label same token
        vm.stopPrank();
        assertEq(registrar.tokenIdOf("alice"), id);
    }

    // ---------------- resolution ----------------

    function test_TokenIdOf_ZeroForUnregistered() public view {
        assertEq(registrar.tokenIdOf("ghost"), 0);
    }

    function test_LabelOf_EmptyForUnregistered() public view {
        assertEq(registrar.labelOf(99), "");
    }

    function test_EffectiveOwner_FollowsFighterTransfer() public {
        // alice registers "alice" → fighter id. After alice transfers the
        // fighter to bob via standard ERC-721 transferFrom, effectiveOwner
        // resolves to bob automatically — registry stays consistent.
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("alice", id);
        assertEq(registrar.effectiveOwner("alice"), alice);

        vm.prank(alice);
        fighter.transferFrom(alice, bob, id);
        assertEq(registrar.effectiveOwner("alice"), bob);
        // Forward map unchanged — label still bound to the same tokenId.
        assertEq(registrar.tokenIdOf("alice"), id);
    }

    function test_EffectiveOwner_ZeroForUnregistered() public view {
        assertEq(registrar.effectiveOwner("nope"), address(0));
    }

    function test_IsAvailable_TrueForFreshValid() public view {
        assertTrue(registrar.isAvailable("freshname"));
    }

    function test_IsAvailable_FalseForTaken() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        registrar.register("alice", id);
        assertFalse(registrar.isAvailable("alice"));
    }

    function test_IsAvailable_FalseForInvalidShape() public view {
        assertFalse(registrar.isAvailable("ab")); // too short
        assertFalse(registrar.isAvailable("Alice")); // uppercase
        assertFalse(registrar.isAvailable("-leading"));
        assertFalse(registrar.isAvailable("trailing-"));
    }

    // ---------------- batch resolution ----------------

    function test_ResolveBatch_ReturnsLabels() public {
        uint256 id1 = _mint(alice);
        uint256 id2 = _mint(bob);
        vm.prank(alice);
        registrar.register("alice", id1);
        vm.prank(bob);
        registrar.register("bob", id2);

        uint256[] memory tokens = new uint256[](3);
        tokens[0] = id1;
        tokens[1] = id2;
        tokens[2] = 99; // unregistered
        string[] memory labels = registrar.resolveBatch(tokens);
        assertEq(labels[0], "alice");
        assertEq(labels[1], "bob");
        assertEq(labels[2], "");
    }

    function test_ResolveLabelsBatch_ReturnsTokens() public {
        uint256 id1 = _mint(alice);
        vm.prank(alice);
        registrar.register("alice", id1);

        string[] memory labels = new string[](2);
        labels[0] = "alice";
        labels[1] = "ghost";
        uint256[] memory tokens = registrar.resolveLabelsBatch(labels);
        assertEq(tokens[0], id1);
        assertEq(tokens[1], 0);
    }

    // ---------------- admin ----------------

    function test_SetRegisterFee_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        registrar.setRegisterFee(1 ether);
        vm.prank(admin);
        registrar.setRegisterFee(1 ether);
        assertEq(registrar.registerFee(), 1 ether);
    }

    function test_SetTreasury_OnlyAdmin() public {
        address t2 = makeAddr("t2");
        vm.prank(alice);
        vm.expectRevert();
        registrar.setTreasury(t2);
        vm.prank(admin);
        registrar.setTreasury(t2);
        assertEq(registrar.treasury(), t2);
    }
}
