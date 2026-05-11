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

/// @dev Smoke-tests the v2 cascade orchestrator against a fresh BattleRegistry
///      to verify constructor ordering, address-cross-references, and the
///      registry role rotation all land cleanly.
contract DeployV2CeremonyTest is Test {
    uint256 internal constant DEPLOYER_PK = 0xA11CE;
    address internal deployer;
    BattleRegistry internal registryV1;
    DeployV2Ceremony internal ceremony;

    function setUp() public {
        deployer = vm.addr(DEPLOYER_PK);
        vm.deal(deployer, 100 ether);
        vm.prank(deployer);
        // v1-equivalent registry — admin = deployer, no escrow yet.
        registryV1 = new BattleRegistry(deployer, address(0));
        ceremony = new DeployV2Ceremony();

        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        vm.setEnv("YAP_BATTLE_REGISTRY_V1", vm.toString(address(registryV1)));
    }

    function test_FullCascade_DeploysAllAndRotatesRole() public {
        DeployV2Ceremony.Deployments memory d = ceremony.run();

        // Every contract address non-zero.
        assertTrue(address(d.fighter) != address(0));
        assertTrue(address(d.escrow) != address(0));
        assertTrue(address(d.fighterMarket) != address(0));
        assertTrue(address(d.rental) != address(0));
        assertTrue(address(d.subname) != address(0));
        assertTrue(address(d.moment) != address(0));
        assertTrue(address(d.momentMarket) != address(0));

        // Cross-references match — every immutable fighter pointer is the new v2 fighter.
        assertEq(address(d.escrow.fighter()), address(d.fighter));
        assertEq(d.fighterMarket.fighterContract(), address(d.fighter));
        assertEq(d.rental.fighterContract(), address(d.fighter));
        assertEq(address(d.subname.fighterContract()), address(d.fighter));
        assertEq(address(d.moment.fighterContract()), address(d.fighter));
        // Moment market points at the new MomentINFT.
        assertEq(d.momentMarket.fighterContract(), address(d.moment));
        // Moment INFT escrow pointer also matches.
        assertEq(address(d.moment.escrow()), address(d.escrow));

        // Role rotation: new escrow holds ESCROW_ROLE on the kept registry.
        bytes32 ESCROW_ROLE = registryV1.ESCROW_ROLE();
        assertTrue(registryV1.hasRole(ESCROW_ROLE, address(d.escrow)));

        // Bi-directional wiring: escrow's registry pointer matches.
        assertEq(address(d.escrow.registry()), address(registryV1));
    }

    function test_OptionalV1EscrowRevoke() public {
        address oldEscrow = makeAddr("old-escrow");
        // Pre-grant ESCROW_ROLE to the would-be v1 escrow to simulate the
        // existing testnet state.
        bytes32 ESCROW_ROLE = registryV1.ESCROW_ROLE();
        vm.prank(deployer);
        registryV1.grantRole(ESCROW_ROLE, oldEscrow);
        assertTrue(registryV1.hasRole(ESCROW_ROLE, oldEscrow));

        vm.setEnv("REVOKE_V1_ESCROW_ROLE", "true");
        vm.setEnv("YAP_BATTLE_ESCROW_V1", vm.toString(oldEscrow));

        ceremony.run();

        // After ceremony, role should have been revoked from old escrow.
        assertFalse(registryV1.hasRole(ESCROW_ROLE, oldEscrow));
    }
}
