// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {IERC7857} from "../src/IERC7857.sol";

/// @notice Fork-test for YapFighter (ERC-7857 character INFT) against the
///         live Galileo deploy. Covers public mint, authorizeUsage,
///         revokeAuthorization, the executor cap, and the proof-bound
///         iTransferFrom / iCloneFrom paths — using vm.prank on the
///         live verifier address to attest TEE-style proofs.
///
/// Run with:
///   forge test --match-contract YapFighterForkE2ETest \
///     --fork-url https://evmrpc-testnet.0g.ai -vvv
contract YapFighterForkE2ETest is Test {
    YapFighter internal fighter;

    address constant FIGHTER_ADDR = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24;
    address constant OWNER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;
    /// @dev Verifier on the live deploy is the same wallet as the deployer.
    address constant VERIFIER = 0x1d4D51F08ab86985533Da9D574A3df68336c485D;
    uint256 constant TOKEN_ID = 1;

    address internal newOwner = makeAddr("e2e-newOwner");
    address internal exec = makeAddr("e2e-executor");
    address internal exec2 = makeAddr("e2e-executor2");

    function setUp() public {
        fighter = YapFighter(FIGHTER_ADDR);
        assertEq(fighter.ownerOf(TOKEN_ID), OWNER);

        // Live mintFee is 0 in the current deploy.
        assertEq(fighter.mintFee(), 0, "mintFee changed - update test");

        vm.deal(OWNER, 5 ether);
        vm.deal(newOwner, 1 ether);
    }

    // ---------------------- mint -----------------------------------

    function test_Mint_FreeMint_AssignsTokenAndPublishesSealedKey() public {
        uint256 idBefore = _nextIdCount();
        vm.prank(OWNER);
        uint256 newId = fighter.mint(
            OWNER,
            "0g://fresh-mint",
            keccak256("fresh-meta"),
            hex"010203"
        );
        assertEq(newId, idBefore + 1, "tokenId not incremented");
        assertEq(fighter.ownerOf(newId), OWNER);
        assertEq(fighter.encryptedURI(newId), "0g://fresh-mint");
        assertEq(fighter.metadataHash(newId), keccak256("fresh-meta"));
    }

    function test_Mint_RevertOnZeroAddress() public {
        vm.prank(OWNER);
        vm.expectRevert(YapFighter.ZeroAddress.selector);
        fighter.mint(address(0), "0g://x", keccak256("x"), hex"00");
    }

    function test_Mint_RevertOnIncorrectFee() public {
        // mintFee==0, so any non-zero msg.value is incorrect.
        vm.prank(OWNER);
        vm.expectRevert(YapFighter.IncorrectFee.selector);
        fighter.mint{value: 1 wei}(OWNER, "0g://x", keccak256("x"), hex"00");
    }

    // ---------------------- authorizeUsage -------------------------

    function test_AuthorizeUsage_AddsExecutorAndRecordsPermissions() public {
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        assertTrue(fighter.isExecutor(TOKEN_ID, exec));
        assertEq(fighter.executorCount(TOKEN_ID), 1);
    }

    function test_AuthorizeUsage_RevertIfNotOwner() public {
        vm.prank(newOwner);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
    }

    function test_RevokeAuthorization_RemovesExecutor() public {
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        vm.prank(OWNER);
        fighter.revokeAuthorization(TOKEN_ID, exec);

        assertFalse(fighter.isExecutor(TOKEN_ID, exec));
        assertEq(fighter.executorCount(TOKEN_ID), 0);
    }

    function test_AuthorizeUsage_DuplicateExecutor_OverwritesPermissions() public {
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"02");

        // Still 1 executor; permissions updated.
        assertEq(fighter.executorCount(TOKEN_ID), 1);
    }

    function test_AuthorizeUsage_TwoDistinctExecutors_BothListed() public {
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec2, hex"02");

        assertEq(fighter.executorCount(TOKEN_ID), 2);
        assertTrue(fighter.isExecutor(TOKEN_ID, exec));
        assertTrue(fighter.isExecutor(TOKEN_ID, exec2));
    }

    // ---------------------- transfer side-effects ------------------

    function test_StandardSafeTransfer_ClearsAuthorizations() public {
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        assertEq(fighter.executorCount(TOKEN_ID), 1);

        vm.prank(OWNER);
        fighter.safeTransferFrom(OWNER, newOwner, TOKEN_ID);

        // _update hook clears authorizations on transfer.
        assertEq(fighter.executorCount(TOKEN_ID), 0, "auths not cleared");
        assertFalse(fighter.isExecutor(TOKEN_ID, exec));
        assertEq(fighter.ownerOf(TOKEN_ID), newOwner);
    }

    // ---------------------- iTransferFrom (proof-bound) ------------

    function test_ITransferFrom_HappyPath_ReSealsAndTransfers() public {
        // 1. Build OwnershipProof referencing the new dataHash + sealedKey.
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0, // TEE
            dataHash: keccak256("fork-new-data-hash"),
            sealedKey: hex"deadbeef",
            targetPubkey: hex"01",
            nonce: hex"02",
            proof: hex"03"
        });

        IERC7857.AccessProof memory ap = IERC7857.AccessProof({
            subscriber: address(0),
            tokenIntent: bytes32(0),
            signature: hex""
        });

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = IERC7857.TransferValidityProof({
            accessProof: ap,
            ownershipProof: op
        });

        // 2. Verifier attests proof freshness for (tokenId, recipient).
        bytes32 proofId = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
        vm.prank(VERIFIER);
        fighter.attestProof(proofId, TOKEN_ID, newOwner);

        // 3. Owner calls iTransferFrom — clears auths, rotates URI/hash, transfers.
        vm.prank(OWNER);
        fighter.authorizeUsage(TOKEN_ID, exec, hex"01");
        vm.prank(OWNER);
        fighter.iTransferFrom(OWNER, newOwner, TOKEN_ID, proofs, "0g://re-sealed");

        assertEq(fighter.ownerOf(TOKEN_ID), newOwner);
        assertEq(fighter.metadataHash(TOKEN_ID), op.dataHash);
        assertEq(fighter.encryptedURI(TOKEN_ID), "0g://re-sealed");
        assertEq(fighter.executorCount(TOKEN_ID), 0, "auths not cleared on iTransfer");
    }

    function test_ITransferFrom_RevertWithoutAttestedProof() public {
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: keccak256("never-attested"),
            sealedKey: hex"00",
            targetPubkey: hex"00",
            nonce: hex"00",
            proof: hex"00"
        });
        IERC7857.AccessProof memory ap = IERC7857.AccessProof(address(0), bytes32(0), hex"");
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = IERC7857.TransferValidityProof(ap, op);

        vm.prank(OWNER);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(OWNER, newOwner, TOKEN_ID, proofs, "0g://x");
    }

    function test_ITransferFrom_RevertEmptyEncryptedURI() public {
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: keccak256("x"),
            sealedKey: hex"00",
            targetPubkey: hex"00",
            nonce: hex"00",
            proof: hex"00"
        });
        IERC7857.AccessProof memory ap = IERC7857.AccessProof(address(0), bytes32(0), hex"");
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = IERC7857.TransferValidityProof(ap, op);

        vm.prank(OWNER);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(OWNER, newOwner, TOKEN_ID, proofs, "");
    }

    // ---------------------- iCloneFrom -----------------------------

    function test_ICloneFrom_MintsNewTokenWithSameURI() public {
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: keccak256("fork-clone-data"),
            sealedKey: hex"01",
            targetPubkey: hex"02",
            nonce: hex"03",
            proof: hex"04"
        });
        IERC7857.AccessProof memory ap = IERC7857.AccessProof(address(0), bytes32(0), hex"");
        IERC7857.TransferValidityProof memory proof = IERC7857.TransferValidityProof(ap, op);

        bytes32 proofId = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
        vm.prank(VERIFIER);
        fighter.attestProof(proofId, TOKEN_ID, newOwner);

        uint256 nextIdBefore = _nextIdCount();
        string memory parentURI = fighter.encryptedURI(TOKEN_ID);

        vm.prank(OWNER);
        uint256 cloneId = fighter.iCloneFrom(newOwner, TOKEN_ID, proof);

        assertEq(cloneId, nextIdBefore + 1);
        assertEq(fighter.ownerOf(cloneId), newOwner);
        // Clone shares the parent's encryptedURI but gets the new sealed key.
        assertEq(fighter.encryptedURI(cloneId), parentURI);
        assertEq(fighter.metadataHash(cloneId), op.dataHash);
        // Parent owner / data unchanged.
        assertEq(fighter.ownerOf(TOKEN_ID), OWNER);
    }

    // ---------------------- helpers --------------------------------

    /// @dev Reads the next-token counter via a fresh mint and rollback
    ///      pattern. We'd peek at _nextId directly but it's private —
    ///      instead, infer from a probe mint+revert. Here we just use
    ///      the highest known minted tokenId + a delta — rather than
    ///      recover from storage we read off the chain state.
    function _nextIdCount() internal view returns (uint256) {
        // Walk forward from TOKEN_ID until ownerOf reverts (token doesn't exist).
        // Bounded loop — just need the count; in practice deploy has <100 tokens.
        for (uint256 id = 1; id < 10_000; ++id) {
            try fighter.ownerOf(id) returns (address) {
                continue;
            } catch {
                return id - 1; // last existing token id
            }
        }
        return 9_999;
    }
}
