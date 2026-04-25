// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";

contract BattleRegistryTest is Test {
    BattleRegistry internal reg;

    address internal admin = makeAddr("admin");
    address internal escrow = makeAddr("escrow");

    uint256 internal constant FA = 1;
    uint256 internal constant FB = 2;

    function setUp() public {
        reg = new BattleRegistry(admin, escrow);
    }

    function _register(uint256 battleId) internal {
        vm.prank(escrow);
        reg.registerBattle(battleId, FA, FB, "topic");
    }

    function _finalize(uint256 battleId, uint8 winner) internal {
        vm.prank(escrow);
        reg.finalizeBattle(battleId, winner);
    }

    // ---------------- registration ----------------

    function test_Register_SetsInitialElo() public {
        _register(1);
        (uint32 eloA,,,) = reg.fighterStats(FA);
        (uint32 eloB,,,) = reg.fighterStats(FB);
        assertEq(eloA, 1200);
        assertEq(eloB, 1200);
    }

    function test_Register_OnlyEscrow() public {
        vm.expectRevert();
        reg.registerBattle(1, FA, FB, "x");
    }

    function test_Register_RevertsDuplicate() public {
        _register(1);
        vm.prank(escrow);
        vm.expectRevert(BattleRegistry.AlreadyRegistered.selector);
        reg.registerBattle(1, FA, FB, "x");
    }

    // ---------------- finalize / ELO ----------------

    function test_Finalize_AWinsUpdatesStats() public {
        _register(1);
        _finalize(1, 0);
        (uint32 eloA, uint32 wins, uint32 losses,) = reg.fighterStats(FA);
        (uint32 eloB, uint32 winsB, uint32 lossesB,) = reg.fighterStats(FB);
        assertEq(wins, 1);
        assertEq(losses, 0);
        assertEq(winsB, 0);
        assertEq(lossesB, 1);
        // equal ELO start → expA=0.5. delta = 32 * (1 - 0.5) = 16.
        assertEq(eloA, 1216);
        assertEq(eloB, 1184);
    }

    function test_Finalize_Draw_HalfPoint() public {
        _register(1);
        _finalize(1, 2);
        (uint32 eloA,,,) = reg.fighterStats(FA);
        (uint32 eloB,,,) = reg.fighterStats(FB);
        // equal ELO, draw → delta = 32 * (0.5 - 0.5) = 0
        assertEq(eloA, 1200);
        assertEq(eloB, 1200);
        assertEq(reg.fighterDraws(FA), 1);
        assertEq(reg.fighterDraws(FB), 1);
    }

    function test_Finalize_LowerRatedWinsGainsMore() public {
        // Bootstrap: give A a head start (wins twice) so eloA > eloB.
        _register(1);
        _finalize(1, 0);
        _register(2);
        _finalize(2, 0);
        (uint32 eloA1,,,) = reg.fighterStats(FA);
        (uint32 eloB1,,,) = reg.fighterStats(FB);
        assertGt(eloA1, eloB1);

        // Now B (underdog) wins against A; B should gain > 16, A should lose > 16.
        _register(3);
        _finalize(3, 1);
        (uint32 eloA2,,,) = reg.fighterStats(FA);
        (uint32 eloB2,,,) = reg.fighterStats(FB);
        uint32 aLoss = eloA1 - eloA2;
        uint32 bGain = eloB2 - eloB1;
        assertGt(aLoss, 16);
        assertGt(bGain, 16);
    }

    function test_Finalize_RevertsAlreadyFinalized() public {
        _register(1);
        _finalize(1, 0);
        vm.prank(escrow);
        vm.expectRevert(BattleRegistry.AlreadyFinalized.selector);
        reg.finalizeBattle(1, 1);
    }

    function test_Finalize_UnknownBattleReverts() public {
        vm.prank(escrow);
        vm.expectRevert(BattleRegistry.UnknownBattle.selector);
        reg.finalizeBattle(99, 0);
    }

    // ---------------- pagination ----------------

    function test_BattleHistory_Pagination() public {
        for (uint256 i = 1; i <= 7; ++i) {
            _register(i);
        }
        BattleRegistry.Battle[] memory p1 = reg.battleHistory(FA, 0, 3);
        BattleRegistry.Battle[] memory p2 = reg.battleHistory(FA, 3, 3);
        BattleRegistry.Battle[] memory p3 = reg.battleHistory(FA, 6, 3);
        BattleRegistry.Battle[] memory p4 = reg.battleHistory(FA, 10, 3); // past end

        assertEq(p1.length, 3);
        assertEq(p2.length, 3);
        assertEq(p3.length, 1);
        assertEq(p4.length, 0);
        assertEq(p1[0].battleId, 1);
        assertEq(p3[0].battleId, 7);
        assertEq(reg.historyLength(FA), 7);
    }

    function test_FighterStats_DefaultElo() public view {
        // unregistered fighter should report default elo
        (uint32 elo,,,) = reg.fighterStats(9999);
        assertEq(elo, 1200);
    }
}
