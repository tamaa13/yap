// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FighterTrainer} from "../src/FighterTrainer.sol";
import {YapFighter} from "../src/YapFighter.sol";

/// @notice Fork-test for FighterTrainer (continuous-learning logbook)
///         against the live Galileo deploys. Validates the deployed
///         bytecode emits the right event, increments per-token
///         counters, gates by INFT ownership, and rejects empty
///         payloads — without spending any OG.
///
/// Run with:
///   forge test --match-contract FighterTrainerForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract FighterTrainerForkE2ETest is Test {
    YapFighter internal fighter;
    FighterTrainer internal trainer;

    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    address constant TRAINER_ADDR = 0xC10bd77cdA8300877898612B00608bA522d5a460;
    address constant OWNER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;
    uint256 constant TOKEN_ID = 1;

    address internal otherWallet = makeAddr("e2e-other");

    function setUp() public {
        fighter = YapFighter(FIGHTER_ADDR);
        trainer = FighterTrainer(TRAINER_ADDR);

        assertEq(fighter.ownerOf(TOKEN_ID), OWNER);
        assertEq(address(trainer.yapFighter()), FIGHTER_ADDR);
    }

    function _train(uint256 tokenId, string memory uri, string memory taskId) internal {
        vm.prank(OWNER);
        trainer.train(
            tokenId,
            uri,
            keccak256("metadata-fork-e2e"),
            hex"01020304",
            taskId,
            "0g-tee-galileo",
            hex"deadbeef"
        );
    }

    function test_HappyPath_IncrementsCounterAndStoresLatest() public {
        uint256 prior = trainer.trainingCount(TOKEN_ID);

        _train(TOKEN_ID, "0g://session-1", "task-uuid-1");

        assertEq(trainer.trainingCount(TOKEN_ID), prior + 1, "counter not incremented");
        assertEq(trainer.latestEncryptedURI(TOKEN_ID), "0g://session-1");
        assertEq(trainer.latestTaskId(TOKEN_ID), "task-uuid-1");
    }

    function test_MultipleSessions_StackCorrectly() public {
        uint256 prior = trainer.trainingCount(TOKEN_ID);

        _train(TOKEN_ID, "0g://session-A", "task-a");
        _train(TOKEN_ID, "0g://session-B", "task-b");
        _train(TOKEN_ID, "0g://session-C", "task-c");

        assertEq(trainer.trainingCount(TOKEN_ID), prior + 3, "3 sessions not stacked");
        // Latest snapshots reflect the most recent train() call.
        assertEq(trainer.latestEncryptedURI(TOKEN_ID), "0g://session-C");
        assertEq(trainer.latestTaskId(TOKEN_ID), "task-c");
    }

    function test_RevertIfNotOwner() public {
        vm.prank(otherWallet);
        vm.expectRevert(FighterTrainer.NotFighterOwner.selector);
        trainer.train(
            TOKEN_ID,
            "0g://attacker",
            keccak256("x"),
            hex"00",
            "task-x",
            "provider",
            hex"00"
        );
    }

    function test_RevertOnEmptyEncryptedURI() public {
        vm.prank(OWNER);
        vm.expectRevert(FighterTrainer.EmptyEncryptedURI.selector);
        trainer.train(TOKEN_ID, "", keccak256("x"), hex"00", "task-x", "p", hex"00");
    }

    function test_RevertOnEmptyTaskId() public {
        vm.prank(OWNER);
        vm.expectRevert(FighterTrainer.EmptyTaskId.selector);
        trainer.train(TOKEN_ID, "0g://x", keccak256("x"), hex"00", "", "p", hex"00");
    }

    function test_OwnershipTransferRevokesTrainingRights() public {
        // Move fighter to a new owner; training by old owner must revert.
        vm.prank(OWNER);
        fighter.safeTransferFrom(OWNER, otherWallet, TOKEN_ID);

        vm.prank(OWNER);
        vm.expectRevert(FighterTrainer.NotFighterOwner.selector);
        trainer.train(
            TOKEN_ID,
            "0g://stale",
            keccak256("x"),
            hex"00",
            "task-x",
            "p",
            hex"00"
        );

        // New owner CAN train.
        vm.prank(otherWallet);
        trainer.train(
            TOKEN_ID,
            "0g://new-owner",
            keccak256("x"),
            hex"00",
            "task-y",
            "p",
            hex"00"
        );
        assertEq(trainer.latestEncryptedURI(TOKEN_ID), "0g://new-owner");
    }

    function test_EmitsFighterTrainedEvent_WithSessionNumber() public {
        uint256 prior = trainer.trainingCount(TOKEN_ID);

        // Don't pre-decode all fields — just assert tokenId + sessionNumber.
        vm.expectEmit(true, true, true, false, TRAINER_ADDR);
        emit FighterTrainer.FighterTrained(
            TOKEN_ID,
            OWNER,
            prior + 1,
            "",
            bytes32(0),
            "",
            "",
            "",
            "",
            0
        );
        _train(TOKEN_ID, "0g://emit-test", "task-emit");
    }
}
