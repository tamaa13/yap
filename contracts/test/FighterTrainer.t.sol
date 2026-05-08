// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FighterTrainer.sol";

contract MockFighter {
    mapping(uint256 => address) public ownerOf;

    function setOwner(uint256 tokenId, address owner_) external {
        ownerOf[tokenId] = owner_;
    }
}

contract FighterTrainerTest is Test {
    MockFighter fighter;
    FighterTrainer trainer;
    address owner = address(0xA11CE);
    address stranger = address(0xBEEF);

    function setUp() public {
        fighter = new MockFighter();
        trainer = new FighterTrainer(address(fighter));
        fighter.setOwner(1, owner);
    }

    function test_constructor_setsYapFighter() public view {
        assertEq(address(trainer.yapFighter()), address(fighter));
    }

    function test_constructor_revertsOnZero() public {
        vm.expectRevert(bytes("yapFighter required"));
        new FighterTrainer(address(0));
    }

    function test_train_emitsEventAndIncrementsCount() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit FighterTrainer.FighterTrained(
            1,
            owner,
            1,
            "0g://0xdeadbeef",
            bytes32(uint256(0xfeed)),
            hex"a1b2",
            "task-uuid-1",
            "0xprovider",
            bytes("sig"),
            block.timestamp
        );
        trainer.train(
            1,
            "0g://0xdeadbeef",
            bytes32(uint256(0xfeed)),
            hex"a1b2",
            "task-uuid-1",
            "0xprovider",
            bytes("sig")
        );
        assertEq(trainer.trainingCount(1), 1);
        assertEq(trainer.latestEncryptedURI(1), "0g://0xdeadbeef");
        assertEq(trainer.latestTaskId(1), "task-uuid-1");
    }

    function test_train_secondSession_increments() public {
        vm.startPrank(owner);
        trainer.train(1, "0g://0xa", bytes32(uint256(1)), hex"01", "t1", "p", bytes("s"));
        trainer.train(1, "0g://0xb", bytes32(uint256(2)), hex"02", "t2", "p", bytes("s"));
        vm.stopPrank();
        assertEq(trainer.trainingCount(1), 2);
        assertEq(trainer.latestEncryptedURI(1), "0g://0xb");
        assertEq(trainer.latestTaskId(1), "t2");
    }

    function test_train_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(FighterTrainer.NotFighterOwner.selector);
        trainer.train(1, "0g://0xa", bytes32(0), hex"", "t1", "p", hex"");
    }

    function test_train_revertsOnEmptyURI() public {
        vm.prank(owner);
        vm.expectRevert(FighterTrainer.EmptyEncryptedURI.selector);
        trainer.train(1, "", bytes32(0), hex"", "t1", "p", hex"");
    }

    function test_train_revertsOnEmptyTaskId() public {
        vm.prank(owner);
        vm.expectRevert(FighterTrainer.EmptyTaskId.selector);
        trainer.train(1, "0g://0xa", bytes32(0), hex"", "", "p", hex"");
    }

    function test_train_changeOfOwnership_blocksOldOwner() public {
        vm.prank(owner);
        trainer.train(1, "0g://0xa", bytes32(0), hex"", "t1", "p", hex"");

        // Transfer ownership off-chain (mocked).
        fighter.setOwner(1, stranger);

        vm.prank(owner);
        vm.expectRevert(FighterTrainer.NotFighterOwner.selector);
        trainer.train(1, "0g://0xb", bytes32(0), hex"", "t2", "p", hex"");

        vm.prank(stranger);
        trainer.train(1, "0g://0xc", bytes32(0), hex"", "t3", "p", hex"");
        assertEq(trainer.trainingCount(1), 2);
        assertEq(trainer.latestTaskId(1), "t3");
    }
}
