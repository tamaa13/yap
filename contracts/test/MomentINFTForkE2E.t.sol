// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {MomentINFT} from "../src/MomentINFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";

interface IFighterRead {
    function ownerOf(uint256) external view returns (address);
}

/// @notice Fork test that exercises MomentINFT against the live Galileo
///         BattleEscrow + YapFighter, using a battle that the deployer
///         has already driven to Settled status (battle #9 at the
///         live escrow). Validates:
///           - The deployed BattleEscrow returns a real Settled Battle
///             struct that MomentINFT's gate accepts.
///           - Live fighter ownership flows through `ownerOf` correctly
///             (impersonated via vm.prank on the on-chain owner).
///           - Same-triple uniqueness, side bounds, and round bounds
///             enforce against real on-chain data.
///
/// Run with:
///   forge test --match-contract MomentINFTForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract MomentINFTForkE2ETest is Test {
    BattleEscrow internal escrow;
    YapFighter internal fighter;
    MomentINFT internal moment;

    address constant ESCROW_ADDR = 0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e;
    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    /// @dev Battle #9 — settled by the deployer prior to this test run.
    uint256 constant SETTLED_BATTLE_ID = 9;

    address internal admin = makeAddr("moment-admin");
    address internal verifier = makeAddr("moment-verifier");
    address internal treasury = makeAddr("moment-treasury");

    BattleEscrow.Battle internal battle;
    address internal sideAOwner;
    address internal sideBOwner;

    function setUp() public {
        escrow = BattleEscrow(ESCROW_ADDR);
        fighter = YapFighter(FIGHTER_ADDR);

        battle = escrow.getBattle(SETTLED_BATTLE_ID);
        require(
            battle.status == BattleEscrow.Status.Settled,
            "fork battle #9 must be Settled"
        );
        require(battle.maxRounds >= 1, "fork battle #9 must have rounds");

        sideAOwner = IFighterRead(FIGHTER_ADDR).ownerOf(battle.fighterA);
        sideBOwner = IFighterRead(FIGHTER_ADDR).ownerOf(battle.fighterB);

        moment = new MomentINFT(
            admin,
            verifier,
            treasury,
            ESCROW_ADDR,
            FIGHTER_ADDR,
            0
        );

        console2.log("battle.fighterA =", battle.fighterA);
        console2.log("battle.fighterB =", battle.fighterB);
        console2.log("battle.maxRounds=", uint256(battle.maxRounds));
        console2.log("sideAOwner      =", sideAOwner);
        console2.log("sideBOwner      =", sideBOwner);
    }

    function test_Fork_Battle9IsSettled() public view {
        assertEq(uint8(battle.status), uint8(BattleEscrow.Status.Settled));
    }

    function test_Fork_MintMoment_SideA_Succeeds() public {
        vm.prank(sideAOwner);
        uint256 id = moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            0,
            "ipfs://moment/round1-A",
            keccak256("metaA"),
            hex"01",
            keccak256("provenanceA")
        );
        assertEq(moment.ownerOf(id), sideAOwner);
        (uint256 b, uint256 fId, , uint16 r, uint8 s) = moment.momentOf(id);
        assertEq(b, SETTLED_BATTLE_ID);
        assertEq(fId, battle.fighterA);
        assertEq(r, 1);
        assertEq(s, 0);
    }

    function test_Fork_MintMoment_SideB_Succeeds() public {
        vm.prank(sideBOwner);
        uint256 id = moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            1,
            "ipfs://moment/round1-B",
            keccak256("metaB"),
            hex"02",
            keccak256("provenanceB")
        );
        assertEq(moment.ownerOf(id), sideBOwner);
        (, uint256 fId, , , uint8 s) = moment.momentOf(id);
        assertEq(fId, battle.fighterB);
        assertEq(s, 1);
    }

    function test_Fork_MintMoment_RevertsOnDuplicateTriple() public {
        vm.prank(sideAOwner);
        moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            0,
            "ipfs://m1",
            keccak256("m"),
            hex"01",
            bytes32(0)
        );
        vm.prank(sideAOwner);
        vm.expectRevert(MomentINFT.MomentAlreadyClaimed.selector);
        moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            0,
            "ipfs://m2",
            keccak256("m2"),
            hex"02",
            bytes32(0)
        );
    }

    function test_Fork_MintMoment_RevertsOnRoundExceedingMax() public {
        uint16 oversize = uint16(uint256(battle.maxRounds) + 1);
        vm.prank(sideAOwner);
        vm.expectRevert(MomentINFT.InvalidRound.selector);
        moment.mintMoment(
            SETTLED_BATTLE_ID,
            oversize,
            0,
            "ipfs://m",
            keccak256("m"),
            hex"01",
            bytes32(0)
        );
    }

    function test_Fork_MintMoment_RevertsForNonFighterUser() public {
        address mallory = makeAddr("mallory");
        vm.assume(mallory != sideAOwner && mallory != sideBOwner);
        vm.prank(mallory);
        vm.expectRevert(MomentINFT.NotFighterUser.selector);
        moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            0,
            "ipfs://m",
            keccak256("m"),
            hex"01",
            bytes32(0)
        );
    }

    function test_Fork_MintMoment_AllowsBothSidesSameRound() public {
        vm.prank(sideAOwner);
        uint256 idA = moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            0,
            "ipfs://A",
            keccak256("a"),
            hex"01",
            bytes32(0)
        );
        vm.prank(sideBOwner);
        uint256 idB = moment.mintMoment(
            SETTLED_BATTLE_ID,
            1,
            1,
            "ipfs://B",
            keccak256("b"),
            hex"02",
            bytes32(0)
        );
        assertEq(moment.ownerOf(idA), sideAOwner);
        assertEq(moment.ownerOf(idB), sideBOwner);
        assertTrue(idA != idB);
    }
}
