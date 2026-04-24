// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {IERC7857} from "../src/IERC7857.sol";
import {IAccessControl} from "openzeppelin-contracts/contracts/access/IAccessControl.sol";

contract YapFighterTest is Test {
    YapFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal operator = makeAddr("operator");

    uint256 internal constant MINT_FEE = 0.01 ether;

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, MINT_FEE);
        vm.startPrank(admin);
        fighter.grantRole(fighter.MINTER_ROLE(), admin);
        fighter.grantRole(fighter.OPERATOR_ROLE(), operator);
        vm.stopPrank();
        vm.deal(admin, 100 ether);
        vm.deal(alice, 100 ether);
    }

    // ---------------- helpers ----------------

    function _mintTo(address to, bytes32 hash_) internal returns (uint256 id) {
        vm.prank(admin);
        id = fighter.mint{value: MINT_FEE}(to, "ipfs://enc/1", hash_, hex"01");
    }

    function _buildProof(bytes32 newHash, bytes memory sealedKey)
        internal
        returns (IERC7857.TransferValidityProof memory tvp, bytes32 proofId)
    {
        IERC7857.AccessProof memory ap = IERC7857.AccessProof({
            subscriber: address(0),
            tokenIntent: bytes32(0),
            signature: ""
        });
        bytes memory nonce = abi.encodePacked(bytes32(uint256(42)));
        bytes memory proofBytes = hex"aabbcc";
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: newHash,
            sealedKey: sealedKey,
            targetPubkey: hex"",
            nonce: nonce,
            proof: proofBytes
        });
        tvp = IERC7857.TransferValidityProof({accessProof: ap, ownershipProof: op});
        proofId = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
        vm.prank(verifier);
        fighter.attestProof(proofId);
    }

    // ---------------- mint ----------------

    function test_Mint_AssignsOwnerAndMetadata() public {
        uint256 id = _mintTo(alice, keccak256("m1"));
        assertEq(fighter.ownerOf(id), alice);
        assertEq(fighter.metadataHash(id), keccak256("m1"));
        assertEq(fighter.encryptedURI(id), "ipfs://enc/1");
        assertEq(treasury.balance, MINT_FEE);
    }

    function test_Mint_RevertsOnIncorrectFee() public {
        vm.prank(admin);
        vm.expectRevert(YapFighter.IncorrectFee.selector);
        fighter.mint{value: 0}(alice, "ipfs://x", keccak256("a"), hex"01");
    }

    function test_Mint_RevertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(YapFighter.ZeroAddress.selector);
        fighter.mint{value: MINT_FEE}(address(0), "ipfs://x", keccak256("a"), hex"01");
    }

    /// Public mint: anyone paying the fee can mint — no MINTER_ROLE gate.
    function test_Mint_PublicMint_Succeeds() public {
        vm.deal(alice, MINT_FEE);
        vm.prank(alice);
        uint256 id = fighter.mint{value: MINT_FEE}(alice, "ipfs://x", keccak256("a"), hex"01");
        assertEq(fighter.ownerOf(id), alice);
        assertEq(fighter.metadataHash(id), keccak256("a"));
    }

    // ---------------- transfer with proof ----------------

    function test_ITransferFrom_TransfersAndUpdatesMetadata() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02");

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id, proofs);

        assertEq(fighter.ownerOf(id), bob);
        assertEq(fighter.metadataHash(id), keccak256("m2"));
    }

    function test_ITransferFrom_RevertsWhenProofUnattested() public {
        uint256 id = _mintTo(alice, keccak256("m"));

        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: keccak256("m2"),
            sealedKey: hex"02",
            targetPubkey: hex"",
            nonce: abi.encodePacked(bytes32(uint256(7))),
            proof: hex"deadbeef"
        });
        IERC7857.TransferValidityProof memory tvp = IERC7857.TransferValidityProof({
            accessProof: IERC7857.AccessProof(address(0), bytes32(0), ""),
            ownershipProof: op
        });
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(alice, bob, id, proofs);
    }

    function test_ITransferFrom_RevertsWhenProofExpired() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02");

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.warp(block.timestamp + fighter.PROOF_VALIDITY() + 1);

        vm.prank(alice);
        vm.expectRevert(YapFighter.ProofExpired.selector);
        fighter.iTransferFrom(alice, bob, id, proofs);
    }

    function test_ITransferFrom_ClearsAuthorizations() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address exec = makeAddr("exec");
        vm.prank(alice);
        fighter.authorizeUsage(id, exec, hex"ff");
        assertTrue(fighter.isExecutor(id, exec));

        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02");
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id, proofs);

        assertFalse(fighter.isExecutor(id, exec));
        assertEq(fighter.executorCount(id), 0);
    }

    function test_ITransferFrom_OperatorCanCallOnBehalfOfOwner() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02");
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(operator);
        fighter.iTransferFrom(alice, bob, id, proofs);
        assertEq(fighter.ownerOf(id), bob);
    }

    // ---------------- clone ----------------

    function test_ICloneFrom_CreatesNewToken() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("mCloned"), hex"03");

        vm.prank(alice);
        uint256 newId = fighter.iCloneFrom(bob, id, tvp);

        assertEq(fighter.ownerOf(newId), bob);
        assertEq(fighter.ownerOf(id), alice);
        assertEq(fighter.metadataHash(newId), keccak256("mCloned"));
        assertEq(fighter.encryptedURI(newId), fighter.encryptedURI(id));
    }

    function test_ICloneFrom_RevertsForNonOwner() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("mCloned"), hex"03");

        vm.prank(bob);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.iCloneFrom(bob, id, tvp);
    }

    // ---------------- authorize / revoke ----------------

    function test_Authorize_AddsExecutor() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address exec = makeAddr("exec");
        vm.prank(alice);
        fighter.authorizeUsage(id, exec, hex"aa");
        assertTrue(fighter.isExecutor(id, exec));
        assertEq(fighter.authorizations(id, exec), hex"aa");
    }

    function test_Authorize_UpdatesPermissionsWithoutDuplicate() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address exec = makeAddr("exec");
        vm.startPrank(alice);
        fighter.authorizeUsage(id, exec, hex"aa");
        fighter.authorizeUsage(id, exec, hex"bb");
        vm.stopPrank();
        assertEq(fighter.executorCount(id), 1);
        assertEq(fighter.authorizations(id, exec), hex"bb");
    }

    function test_Authorize_RevertsForNonOwner() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address exec = makeAddr("exec");
        vm.prank(bob);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.authorizeUsage(id, exec, hex"aa");
    }

    function test_Revoke_RemovesExecutor() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address execA = makeAddr("execA");
        address execB = makeAddr("execB");
        vm.startPrank(alice);
        fighter.authorizeUsage(id, execA, hex"aa");
        fighter.authorizeUsage(id, execB, hex"bb");
        fighter.revokeAuthorization(id, execA);
        vm.stopPrank();

        assertFalse(fighter.isExecutor(id, execA));
        assertTrue(fighter.isExecutor(id, execB));
        assertEq(fighter.executorCount(id), 1);
    }

    function test_Authorize_CapEnforced() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        uint256 cap = fighter.MAX_EXECUTORS();
        vm.startPrank(alice);
        for (uint256 i = 0; i < cap; ++i) {
            fighter.authorizeUsage(id, address(uint160(0x10000 + i)), hex"01");
        }
        vm.expectRevert(YapFighter.ExecutorCapReached.selector);
        fighter.authorizeUsage(id, address(uint160(0xffff)), hex"01");
        vm.stopPrank();
    }

    // ---------------- admin ----------------

    function test_SetVerifier_OnlyAdmin() public {
        address v2 = makeAddr("v2");
        vm.prank(alice);
        vm.expectRevert();
        fighter.setVerifier(v2);
        vm.prank(admin);
        fighter.setVerifier(v2);
        assertEq(fighter.verifier(), v2);
    }

    function test_AttestProof_OnlyVerifier() public {
        vm.prank(alice);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.attestProof(keccak256("x"));
    }

    function test_SupportsInterface_IncludesERC7857() public view {
        assertTrue(fighter.supportsInterface(type(IERC7857).interfaceId));
    }
}
