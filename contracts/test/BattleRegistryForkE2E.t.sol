// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";

/// @notice Fork-test for BattleRegistry against the live Galileo deploy.
///         Verifies the ELO update math, status mutations, and access
///         control on the deployed bytecode by pranking the live
///         BattleEscrow address (which already holds ESCROW_ROLE).
///
/// Run with:
///   forge test --match-contract BattleRegistryForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract BattleRegistryForkE2ETest is Test {
    BattleRegistry internal registry;

    address constant REGISTRY_ADDR = 0x755EF230d456B6CC991CcffF38eC5C6b0133d37B;
    address constant ESCROW_ADDR = 0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e;

    /// @dev Pick freshish battle IDs unlikely to collide with live state.
    ///      Each test uses a unique ID range so vm-reverts between tests
    ///      don't matter — fork tests reset state per test.
    uint256 internal constant BASE_ID = 990_000_000;

    function setUp() public {
        registry = BattleRegistry(REGISTRY_ADDR);
        // Sanity: live escrow already holds ESCROW_ROLE.
        bytes32 ESCROW_ROLE = registry.ESCROW_ROLE();
        assertTrue(registry.hasRole(ESCROW_ROLE, ESCROW_ADDR), "escrow role missing");
    }

    function _register(uint256 battleId, uint256 fighterA, uint256 fighterB) internal {
        vm.prank(ESCROW_ADDR);
        registry.registerBattle(battleId, fighterA, fighterB, "fork-test");
    }

    // ---------------------- registerBattle -------------------------

    function test_RegisterBattle_StoresShape() public {
        uint256 id = BASE_ID + 1;
        _register(id, 1001, 1002);

        BattleRegistry.Battle memory b = registry.battleOf(id);
        assertEq(b.battleId, id);
        assertEq(b.fighterA, 1001);
        assertEq(b.fighterB, 1002);
        assertEq(b.topic, "fork-test");
        assertFalse(b.finalized);
    }

    function test_RegisterBattle_RevertOnDuplicate() public {
        uint256 id = BASE_ID + 2;
        _register(id, 2001, 2002);

        vm.prank(ESCROW_ADDR);
        vm.expectRevert(BattleRegistry.AlreadyRegistered.selector);
        registry.registerBattle(id, 2001, 2002, "dup");
    }

    function test_RegisterBattle_RevertIfNotEscrow() public {
        uint256 id = BASE_ID + 3;
        // Random caller — no role.
        vm.expectRevert();
        registry.registerBattle(id, 3001, 3002, "unauthorized");
    }

    function test_RegisterBattle_AssignsDefaultEloToFreshFighters() public {
        // Use unique fighter IDs unlikely to have prior history on chain.
        uint256 fA = 9_999_001;
        uint256 fB = 9_999_002;
        _register(BASE_ID + 4, fA, fB);

        (uint32 elo,,,) = registry.fighterStats(fA);
        assertEq(elo, 1200, "default ELO not set");
    }

    // ---------------------- finalizeBattle -------------------------

    function test_FinalizeBattle_SideAWins_AdjustsElo() public {
        uint256 fA = 9_999_011;
        uint256 fB = 9_999_012;
        uint256 id = BASE_ID + 11;

        _register(id, fA, fB);
        (uint32 priorEloA,,,) = registry.fighterStats(fA);
        (uint32 priorEloB,,,) = registry.fighterStats(fB);

        vm.prank(ESCROW_ADDR);
        registry.finalizeBattle(id, 0);

        (uint32 newEloA, uint32 winsA, uint32 lossesA,) = registry.fighterStats(fA);
        (uint32 newEloB,, uint32 lossesB,) = registry.fighterStats(fB);

        assertGt(newEloA, priorEloA, "winner ELO didn't go up");
        assertLt(newEloB, priorEloB, "loser ELO didn't go down");
        assertEq(winsA, 1);
        assertEq(lossesA, 0);
        assertEq(lossesB, 1);
    }

    function test_FinalizeBattle_SideBWins() public {
        uint256 fA = 9_999_021;
        uint256 fB = 9_999_022;
        uint256 id = BASE_ID + 21;
        _register(id, fA, fB);

        vm.prank(ESCROW_ADDR);
        registry.finalizeBattle(id, 1);

        (, uint32 winsA, uint32 lossesA,) = registry.fighterStats(fA);
        (, uint32 winsB, uint32 lossesB,) = registry.fighterStats(fB);
        assertEq(winsA, 0);
        assertEq(lossesA, 1);
        assertEq(winsB, 1);
        assertEq(lossesB, 0);
    }

    function test_FinalizeBattle_Draw_BumpsBothDraws() public {
        uint256 fA = 9_999_031;
        uint256 fB = 9_999_032;
        uint256 id = BASE_ID + 31;
        _register(id, fA, fB);

        vm.prank(ESCROW_ADDR);
        registry.finalizeBattle(id, 2);

        assertEq(registry.fighterDraws(fA), 1);
        assertEq(registry.fighterDraws(fB), 1);
    }

    function test_FinalizeBattle_RevertOnDoubleFinalize() public {
        uint256 id = BASE_ID + 41;
        _register(id, 4101, 4102);
        vm.prank(ESCROW_ADDR);
        registry.finalizeBattle(id, 0);

        vm.prank(ESCROW_ADDR);
        vm.expectRevert(BattleRegistry.AlreadyFinalized.selector);
        registry.finalizeBattle(id, 0);
    }

    function test_FinalizeBattle_RevertOnUnknownBattle() public {
        vm.prank(ESCROW_ADDR);
        vm.expectRevert(BattleRegistry.UnknownBattle.selector);
        registry.finalizeBattle(BASE_ID + 51, 0);
    }

    function test_FinalizeBattle_RevertOnInvalidWinner() public {
        uint256 id = BASE_ID + 61;
        _register(id, 6101, 6102);
        vm.prank(ESCROW_ADDR);
        vm.expectRevert(BattleRegistry.InvalidWinner.selector);
        registry.finalizeBattle(id, 3);
    }

    // ---------------------- views ----------------------------------

    function test_FighterStats_DefaultEloForFreshFighter() public view {
        // A clearly-untouched fighter id returns DEFAULT_ELO without any
        // registration ever happening.
        uint256 brandNew = 8_888_888_888;
        (uint32 elo, uint32 wins, uint32 losses, uint256 earnings) = registry.fighterStats(brandNew);
        assertEq(elo, 1200);
        assertEq(wins, 0);
        assertEq(losses, 0);
        assertEq(earnings, 0);
    }
}
