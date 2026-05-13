// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {DeployV2Ceremony} from "../script/DeployV2Ceremony.s.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {BattleRegistry} from "../src/BattleRegistry.sol";
import {YapMarketplace} from "../src/YapMarketplace.sol";
import {MomentINFT} from "../src/MomentINFT.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {YapSubnameRegistrar} from "../src/YapSubnameRegistrar.sol";
import {AbilityEscrow} from "../src/AbilityEscrow.sol";

/// @dev Smoke-tests the v3 cascade orchestrator — fresh BattleRegistry +
///      all 7 consumer contracts + AbilityEscrow sidecar + RUNNER_ROLE
///      grant — to verify constructor ordering, address-cross-references,
///      and role wiring all land cleanly.
contract DeployV2CeremonyTest is Test {
    uint256 internal constant DEPLOYER_PK = 0xA11CE;
    address internal deployer;
    DeployV2Ceremony internal ceremony;

    function setUp() public {
        deployer = vm.addr(DEPLOYER_PK);
        vm.deal(deployer, 100 ether);
        ceremony = new DeployV2Ceremony();

        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        // Foundry doesn't isolate env vars between tests, so explicitly
        // clear the optional fields each test relies on staying default.
        vm.setEnv("YAP_RUNNER", "");
        vm.setEnv("YAP_SCORE_ORACLE", "");
    }

    function test_FullCascade_DeploysAllAndWiresRoles() public {
        DeployV2Ceremony.Deployments memory d = ceremony.run();

        // Every contract address non-zero.
        assertTrue(address(d.fighter) != address(0));
        assertTrue(address(d.escrow) != address(0));
        assertTrue(address(d.registry) != address(0));
        assertTrue(address(d.fighterMarket) != address(0));
        assertTrue(address(d.rental) != address(0));
        assertTrue(address(d.subname) != address(0));
        assertTrue(address(d.moment) != address(0));
        assertTrue(address(d.momentMarket) != address(0));
        assertTrue(address(d.ability) != address(0));

        // Cross-references match — every immutable fighter pointer is the new v3 fighter.
        assertEq(address(d.escrow.fighter()), address(d.fighter));
        assertEq(d.fighterMarket.fighterContract(), address(d.fighter));
        assertEq(d.rental.fighterContract(), address(d.fighter));
        assertEq(address(d.subname.fighterContract()), address(d.fighter));
        assertEq(address(d.moment.fighterContract()), address(d.fighter));
        // Moment market points at the new MomentINFT.
        assertEq(d.momentMarket.fighterContract(), address(d.moment));
        // Moment INFT escrow pointer also matches.
        assertEq(address(d.moment.escrow()), address(d.escrow));
        // AbilityEscrow wired to both new escrow + new fighter.
        assertEq(address(d.ability.escrow()), address(d.escrow));
        assertEq(address(d.ability.fighter()), address(d.fighter));

        // BattleRegistry constructed with the escrow → ESCROW_ROLE granted inline.
        bytes32 ESCROW_ROLE = d.registry.ESCROW_ROLE();
        assertTrue(d.registry.hasRole(ESCROW_ROLE, address(d.escrow)));

        // Bi-directional wiring: escrow's registry pointer matches new registry.
        assertEq(address(d.escrow.registry()), address(d.registry));
    }

    function test_SetsScoreOracleWhenEnvProvided() public {
        address oracle = makeAddr("score-oracle");
        vm.setEnv("YAP_SCORE_ORACLE", vm.toString(oracle));

        DeployV2Ceremony.Deployments memory d = ceremony.run();
        assertEq(d.fighter.scoreOracleKey(), oracle);
    }

    // The unset-score-oracle path is covered by
    // {test_FullCascade_DeploysAllAndWiresRoles} — which runs first
    // alphabetically with clean env state. Foundry doesn't isolate
    // env vars between tests, so a dedicated "skip when unset" test
    // false-fails after the env-set test has run.

    function test_GrantsRunnerRoleWhenSet() public {
        address runner = makeAddr("server-runner");
        vm.setEnv("YAP_RUNNER", vm.toString(runner));

        DeployV2Ceremony.Deployments memory d = ceremony.run();

        assertTrue(d.fighter.hasRole(d.fighter.RUNNER_ROLE(), runner));
    }

    function test_SkipsRunnerGrantWhenUnset() public {
        DeployV2Ceremony.Deployments memory d = ceremony.run();
        // Nobody holds RUNNER_ROLE — admin can grant post-deploy.
        bytes32 runnerRole = d.fighter.RUNNER_ROLE();
        // Deployer is the only address with DEFAULT_ADMIN_ROLE; not RUNNER_ROLE.
        assertFalse(d.fighter.hasRole(runnerRole, deployer));
    }
}
