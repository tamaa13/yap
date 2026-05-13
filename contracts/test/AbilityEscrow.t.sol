// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {AbilityEscrow} from "../src/AbilityEscrow.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

contract AbilityEscrowTest is Test {
    AbilityEscrow internal ability;
    YapFighter internal fighter;
    BattleEscrow internal escrow;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant SCORE_ORACLE_PK = 0xC0DE5C;
    uint256 internal constant VERDICT_ORACLE_PK = 0xA1A2A3;

    /// Mirror of AbilityEscrow.SIDE_{A,B} as local constants — referencing
    /// `ability.SIDE_A()` inline would consume vm.prank since the call is
    /// evaluated before the next intended call frame.
    uint8 internal constant SIDE_A = 0;
    uint8 internal constant SIDE_B = 1;

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, 0);
        escrow = new BattleEscrow(
            admin, treasury, vm.addr(VERDICT_ORACLE_PK), address(fighter)
        );
        ability = new AbilityEscrow(address(escrow), address(fighter), admin);

        vm.prank(admin);
        fighter.setScoreOracleKey(vm.addr(SCORE_ORACLE_PK));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ---------------- helpers ----------------

    /// Mint + score in one shot. `scores` is the 5-trait vector that gets
    /// committed via {recordMintScores} after mint.
    function _mintAndScore(
        address to,
        YapFighter.Archetype arch,
        bytes32 seedHash,
        uint8[5] memory scores
    ) internal returns (uint256 id) {
        vm.prank(to);
        id = fighter.mint(
            to,
            "ipfs://test",
            keccak256(abi.encodePacked("meta-", seedHash)),
            hex"01",
            arch,
            seedHash
        );

        bytes memory canonical = bytes(
            this.callScoreCanonicalText(id, seedHash, scores)
        );
        bytes memory responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        bytes32 respSha = sha256(responseBody);
        bytes memory signedText = abi.encodePacked(
            _hex64(keccak256("req")),
            ":", _hex64(respSha),
            ":t:t:", _hex64(keccak256("tls"))
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(SCORE_ORACLE_PK, digest);
        bytes memory signature = abi.encodePacked(r, s, vv);

        vm.prank(to);
        fighter.recordMintScores(id, scores, seedHash, responseBody, 12, signedText, signature);
    }

    function callScoreCanonicalText(
        uint256 tokenId,
        bytes32 seedHash,
        uint8[5] calldata scores
    ) external view returns (string memory) {
        return fighter.scoreCanonicalText(tokenId, seedHash, scores);
    }

    function _hex64(bytes32 b) internal pure returns (bytes memory) {
        bytes memory withPrefix = bytes(Strings.toHexString(uint256(b), 32));
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 64; ++i) out[i] = withPrefix[i + 2];
        return out;
    }

    /// Stand up a Live battle between fighterA (alice) and fighterB (bob).
    function _liveBattle(uint256 fighterA, uint256 fighterB) internal returns (uint256 id) {
        vm.prank(alice);
        id = escrow.createBattle{value: 1 ether}(
            fighterA, fighterB, "is cereal soup?", 3
        );
        vm.prank(bob);
        escrow.acceptBattle{value: 1 ether}(id);
    }

    // ---------------- happy paths ----------------

    function test_UseAbility_Roaster_PassesGate() public {
        // Roaster gates on Aggression (idx 2) >= 3.
        uint8[5] memory aliceScores = [uint8(2), 2, 4, 2, 2];
        uint8[5] memory bobScores   = [uint8(2), 2, 4, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), aliceScores);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), bobScores);
        uint256 id = _liveBattle(fA, fB);

        vm.expectEmit(true, true, false, true, address(ability));
        emit AbilityEscrow.AbilityUsed(id, SIDE_A, fA, YapFighter.Archetype.Roaster, 2);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 2);

        (bool used, uint64 round) = ability.getAbilityUsage(id, SIDE_A);
        assertTrue(used);
        assertEq(round, 2);
        assertTrue(ability.isAbilityUsed(id, SIDE_A));
        assertFalse(ability.isAbilityUsed(id, SIDE_B));
    }

    function test_UseAbility_Debater_PassesGate() public {
        // Debater gates on Logos (idx 0) >= 3.
        uint8[5] memory s = [uint8(4), 2, 2, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Debater, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), [uint8(2), 2, 4, 2, 2]);
        uint256 id = _liveBattle(fA, fB);

        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);
        assertTrue(ability.isAbilityUsed(id, SIDE_A));
    }

    function test_UseAbility_Philosopher_RequiresLogosFour() public {
        // Philosopher gates on Logos (idx 0) >= 4.
        uint8[5] memory s3 = [uint8(3), 2, 2, 2, 2];
        uint8[5] memory s4 = [uint8(4), 2, 2, 2, 2];

        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Philosopher, keccak256("a3"), s3);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), [uint8(2), 2, 4, 2, 2]);
        uint256 id = _liveBattle(fA, fB);

        vm.expectRevert(AbilityEscrow.AbilityGateUnmet.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);

        // Mint a second Philosopher with logos=4 — passes.
        uint256 fA2 = _mintAndScore(alice, YapFighter.Archetype.Philosopher, keccak256("a4"), s4);
        uint256 fB2 = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b2"), [uint8(2), 2, 4, 2, 2]);
        uint256 id2 = _liveBattle(fA2, fB2);
        vm.prank(alice);
        ability.useAbility(id2, SIDE_A, 1);
        assertTrue(ability.isAbilityUsed(id2, SIDE_A));
    }

    function test_UseAbility_RunnerRoleCanCall() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        address runner = makeAddr("ability-runner");
        bytes32 role = fighter.RUNNER_ROLE();
        vm.prank(admin);
        fighter.grantRole(role, runner);

        vm.prank(runner);
        ability.useAbility(id, SIDE_A, 1);
        assertTrue(ability.isAbilityUsed(id, SIDE_A));
    }

    function test_UseAbility_BothSidesIndependently() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 2);
        vm.prank(bob);
        ability.useAbility(id, SIDE_B, 3);

        (bool usedA, uint64 rA) = ability.getAbilityUsage(id, SIDE_A);
        (bool usedB, uint64 rB) = ability.getAbilityUsage(id, SIDE_B);
        assertTrue(usedA);
        assertEq(rA, 2);
        assertTrue(usedB);
        assertEq(rB, 3);
    }

    // ---------------- revert paths ----------------

    function test_UseAbility_RevertsOnDoubleUse() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);

        vm.expectRevert(AbilityEscrow.AbilityAlreadyUsed.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 2);
    }

    function test_UseAbility_RevertsOnInvalidSide() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        vm.expectRevert(AbilityEscrow.InvalidSide.selector);
        vm.prank(alice);
        ability.useAbility(id, 2, 1);
    }

    function test_UseAbility_RevertsOnInvalidRound() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        // round 0
        vm.expectRevert(AbilityEscrow.InvalidRound.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 0);

        // round > maxRounds (3)
        vm.expectRevert(AbilityEscrow.InvalidRound.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 4);
    }

    function test_UseAbility_RevertsWhenNotLive() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        // Pending — battle never accepted
        vm.prank(alice);
        uint256 id = escrow.createBattle{value: 1 ether}(fA, fB, "x", 3);

        vm.expectRevert(AbilityEscrow.BattleNotLive.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);
    }

    function test_UseAbility_RevertsOnUnauthorized() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        // carol is neither owner nor executor nor runner.
        vm.expectRevert(AbilityEscrow.NotAuthorized.selector);
        vm.prank(carol);
        ability.useAbility(id, SIDE_A, 1);
    }

    function test_UseAbility_AuthorizedExecutorCanCall() public {
        uint8[5] memory s = [uint8(2), 2, 5, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Roaster, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), s);
        uint256 id = _liveBattle(fA, fB);

        // Alice authorizes carol as an executor on fighter A.
        vm.prank(alice);
        fighter.authorizeUsage(fA, carol, hex"ff");

        vm.prank(carol);
        ability.useAbility(id, SIDE_A, 1);
        assertTrue(ability.isAbilityUsed(id, SIDE_A));
    }

    function test_UseAbility_RevertsOnGateUnmet() public {
        // Troll gates on Aggression (idx 2) >= 4. Alice's Troll has agg=3.
        uint8[5] memory s = [uint8(2), 2, 3, 2, 2];
        uint256 fA = _mintAndScore(alice, YapFighter.Archetype.Troll, keccak256("a"), s);
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), [uint8(2), 2, 4, 2, 2]);
        uint256 id = _liveBattle(fA, fB);

        vm.expectRevert(AbilityEscrow.AbilityGateUnmet.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);
    }

    function test_UseAbility_RevertsWhenUnscored() public {
        // Mint without scoring → traits are all zero → no gate clears.
        bytes32 seed = keccak256("unscored");
        vm.prank(alice);
        uint256 fA = fighter.mint(
            alice, "ipfs://x", keccak256("m"), hex"01",
            YapFighter.Archetype.Roaster, seed
        );
        uint8[5] memory bs = [uint8(2), 2, 5, 2, 2];
        uint256 fB = _mintAndScore(bob, YapFighter.Archetype.Roaster, keccak256("b"), bs);
        uint256 id = _liveBattle(fA, fB);

        vm.expectRevert(AbilityEscrow.AbilityGateUnmet.selector);
        vm.prank(alice);
        ability.useAbility(id, SIDE_A, 1);
    }

    // ---------------- gate table ----------------

    function test_RequiredScore_AllArchetypes() public view {
        (uint8 i, uint8 m) = ability.requiredScore(YapFighter.Archetype.Roaster);
        assertEq(i, 2); assertEq(m, 3);
        (i, m) = ability.requiredScore(YapFighter.Archetype.Debater);
        assertEq(i, 0); assertEq(m, 3);
        (i, m) = ability.requiredScore(YapFighter.Archetype.Philosopher);
        assertEq(i, 0); assertEq(m, 4);
        (i, m) = ability.requiredScore(YapFighter.Archetype.Troll);
        assertEq(i, 2); assertEq(m, 4);
        (i, m) = ability.requiredScore(YapFighter.Archetype.Scholar);
        assertEq(i, 3); assertEq(m, 3);
        (i, m) = ability.requiredScore(YapFighter.Archetype.Provocateur);
        assertEq(i, 1); assertEq(m, 3);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(AbilityEscrow.ZeroAddress.selector);
        new AbilityEscrow(address(0), address(fighter), admin);
        vm.expectRevert(AbilityEscrow.ZeroAddress.selector);
        new AbilityEscrow(address(escrow), address(0), admin);
        vm.expectRevert(AbilityEscrow.ZeroAddress.selector);
        new AbilityEscrow(address(escrow), address(fighter), address(0));
    }
}
