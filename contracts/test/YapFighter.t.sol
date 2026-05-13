// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, Vm} from "forge-std/Test.sol";
import {YapFighter} from "../src/YapFighter.sol";
import {IERC7857} from "../src/IERC7857.sol";
import {IAccessControl} from "openzeppelin-contracts/contracts/access/IAccessControl.sol";
import {TEEAttestationLib} from "../src/TEEAttestationLib.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

contract YapFighterTest is Test {
    YapFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant MINT_FEE = 0.01 ether;
    string internal constant NEW_URI = "ipfs://enc/new";

    function setUp() public {
        fighter = new YapFighter(admin, verifier, treasury, MINT_FEE);
        vm.deal(admin, 100 ether);
        vm.deal(alice, 100 ether);
    }

    // ---------------- helpers ----------------

    function _mintTo(address to, bytes32 hash_) internal returns (uint256 id) {
        vm.prank(admin);
        id = fighter.mint{value: MINT_FEE}(
            to,
            "ipfs://enc/1",
            hash_,
            hex"01",
            YapFighter.Archetype.Roaster,
            keccak256(abi.encodePacked("seed-", hash_))
        );
    }

    function _buildProof(
        bytes32 newHash,
        bytes memory sealedKey,
        uint256 tokenId,
        address recipient
    )
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
        proofId = keccak256(
            abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof, block.chainid)
        );
        vm.prank(verifier);
        fighter.attestProof(proofId, tokenId, recipient);
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
        fighter.mint{value: 0}(
            alice, "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Roaster, keccak256("seed")
        );
    }

    function test_Mint_RevertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(YapFighter.ZeroAddress.selector);
        fighter.mint{value: MINT_FEE}(
            address(0), "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Roaster, keccak256("seed")
        );
    }

    function test_Mint_RevertsOnZeroSeedHash() public {
        vm.prank(admin);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.mint{value: MINT_FEE}(
            alice, "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Roaster, bytes32(0)
        );
    }

    /// Public mint: anyone paying the fee can mint — no MINTER_ROLE gate.
    function test_Mint_PublicMint_Succeeds() public {
        vm.deal(alice, MINT_FEE);
        vm.prank(alice);
        uint256 id = fighter.mint{value: MINT_FEE}(
            alice, "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Debater, keccak256("alice-seed")
        );
        assertEq(fighter.ownerOf(id), alice);
        assertEq(fighter.metadataHash(id), keccak256("a"));
        assertEq(uint8(fighter.getArchetype(id)), uint8(YapFighter.Archetype.Debater));
        assertEq(fighter.getSeedHash(id), keccak256("alice-seed"));
        assertFalse(fighter.isScored(id));
    }

    /// Successful mint that pays a non-zero fee emits MintFeePaid with
    /// the fee amount + tokenId so analytics can audit mint economics
    /// without parsing tx value.
    function test_Mint_EmitsMintFeePaid_WhenFeeIsNonZero() public {
        vm.deal(alice, MINT_FEE);
        vm.expectEmit(true, true, false, true, address(fighter));
        emit YapFighter.MintFeePaid(alice, MINT_FEE, 1);
        vm.prank(alice);
        fighter.mint{value: MINT_FEE}(
            alice, "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Debater, keccak256("alice-seed-fee")
        );
    }

    /// Zero-fee mints skip the MintFeePaid emission — keeps the event
    /// stream lean when admin temporarily sets mintFee=0 (e.g. promo).
    function test_Mint_NoMintFeePaidEvent_WhenFeeIsZero() public {
        vm.prank(admin);
        fighter.setMintFee(0);

        vm.recordLogs();
        vm.prank(alice);
        fighter.mint{value: 0}(
            alice, "ipfs://x", keccak256("a"), hex"01",
            YapFighter.Archetype.Roaster, keccak256("alice-seed-free")
        );

        bytes32 sig = keccak256("MintFeePaid(address,uint256,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != sig, "MintFeePaid should not fire when fee=0");
        }
    }

    /// IERC7857.mint (4-arg) reverts unconditionally — clients must use
    /// the 6-arg overload that commits archetype + seedHash.
    function test_Mint_LegacyFourArgReverts() public {
        vm.deal(alice, MINT_FEE);
        vm.prank(alice);
        vm.expectRevert(YapFighter.MintNotSupported.selector);
        fighter.mint{value: MINT_FEE}(alice, "ipfs://x", keccak256("a"), hex"01");
    }

    // ---------------- transfer with proof ----------------

    function test_ITransferFrom_TransfersAndUpdatesMetadata() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02", id, bob);

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);

        assertEq(fighter.ownerOf(id), bob);
        assertEq(fighter.metadataHash(id), keccak256("m2"));
        assertEq(fighter.encryptedURI(id), NEW_URI);
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
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);
    }

    function test_ITransferFrom_RevertsWhenProofExpired() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02", id, bob);

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.warp(block.timestamp + fighter.PROOF_VALIDITY() + 1);

        vm.prank(alice);
        vm.expectRevert(YapFighter.ProofExpired.selector);
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);
    }

    function test_ITransferFrom_RevertsWhenURIEmpty() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(alice, bob, id, proofs, "");
    }

    function test_ITransferFrom_ProofIsBoundToTokenAndRecipient() public {
        // Two tokens, alice owns both. Verifier attests a proof scoped to
        // token1+bob but caller tries to use it on token2+bob — must reject.
        uint256 id1 = _mintTo(alice, keccak256("m1"));
        uint256 id2 = _mintTo(alice, keccak256("m2"));
        (IERC7857.TransferValidityProof memory tvp,) =
            _buildProof(keccak256("new"), hex"02", id1, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(alice, bob, id2, proofs, NEW_URI);

        // Same proof against the correct token must succeed.
        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id1, proofs, NEW_URI);
        assertEq(fighter.ownerOf(id1), bob);
    }

    function test_ITransferFrom_ClearsAuthorizations() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        address exec = makeAddr("exec");
        vm.prank(alice);
        fighter.authorizeUsage(id, exec, hex"ff");
        assertTrue(fighter.isExecutor(id, exec));

        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);

        assertFalse(fighter.isExecutor(id, exec));
        assertEq(fighter.executorCount(id), 0);
    }

    function test_ITransferFrom_RevertsForNonOwnerCaller() public {
        // Brief: self-custodial. Only the token owner can iTransferFrom — no
        // operator superuser path. Even an attested proof can't be used by a
        // third party to move someone else's token.
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(bob);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);
    }

    // ---------------- clone ----------------

    function test_ICloneFrom_CreatesNewToken() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("mCloned"), hex"03", id, bob);

        vm.prank(alice);
        uint256 newId = fighter.iCloneFrom(bob, id, tvp);

        assertEq(fighter.ownerOf(newId), bob);
        assertEq(fighter.ownerOf(id), alice);
        assertEq(fighter.metadataHash(newId), keccak256("mCloned"));
        assertEq(fighter.encryptedURI(newId), fighter.encryptedURI(id));
    }

    function test_ICloneFrom_RevertsForNonOwner() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(keccak256("mCloned"), hex"03", id, bob);

        vm.prank(bob);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.iCloneFrom(bob, id, tvp);
    }

    /// @dev Single-use proof replay protection. Without consuming the
    ///      proof after first use, an owner could mint N clones from a
    ///      single attestation within the validity window. We mark the
    ///      (proofId, tokenId, recipient) tuple consumed on success.
    function test_ICloneFrom_RevertsOnProofReplay() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(
            keccak256("mClonedReplay"),
            hex"03",
            id,
            bob
        );

        vm.prank(alice);
        fighter.iCloneFrom(bob, id, tvp);

        // Same proof, same recipient — should fail on the consumed flag.
        vm.prank(alice);
        vm.expectRevert(YapFighter.ProofAlreadyConsumed.selector);
        fighter.iCloneFrom(bob, id, tvp);
    }

    function test_ITransferFrom_RevertsOnProofReplay() public {
        uint256 id = _mintTo(alice, keccak256("m"));
        (IERC7857.TransferValidityProof memory tvp,) = _buildProof(
            keccak256("mTransferReplay"),
            hex"04",
            id,
            bob
        );
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        fighter.iTransferFrom(alice, bob, id, proofs, NEW_URI);

        // Bob now owns. If they tried to use the same proof to bounce
        // it back to alice, ownership atomicity already blocked it. But
        // anyone trying to *replay* the same (proofId, tokenId, bob)
        // tuple gets the explicit consumed-flag revert.
        vm.prank(bob);
        vm.expectRevert(YapFighter.ProofAlreadyConsumed.selector);
        fighter.iTransferFrom(bob, bob, id, proofs, NEW_URI);
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
        fighter.attestProof(keccak256("x"), 1, bob);
    }

    function test_SupportsInterface_IncludesERC7857() public view {
        assertTrue(fighter.supportsInterface(type(IERC7857).interfaceId));
    }

    // ---------------- persona access log (P3F) ----------------

    function test_LogAccess_OwnerEmitsAndIncrements() public {
        uint256 id = _mintTo(alice, keccak256("log-owner"));
        assertEq(fighter.getAccessCount(id), 0);
        uint256 ts = block.timestamp;
        vm.expectEmit(true, true, true, true, address(fighter));
        emit YapFighter.PersonaAccessed(id, alice, 42, uint64(ts));
        vm.prank(alice);
        fighter.logAccess(id, 42);
        assertEq(fighter.getAccessCount(id), 1);
    }

    function test_LogAccess_AuthorizedExecutorEmitsAndIncrements() public {
        uint256 id = _mintTo(alice, keccak256("log-exec"));
        address runner = makeAddr("runner");
        vm.prank(alice);
        fighter.authorizeUsage(id, runner, hex"01");

        vm.prank(runner);
        fighter.logAccess(id, 99);
        assertEq(fighter.getAccessCount(id), 1);

        vm.prank(runner);
        fighter.logAccess(id, 99);
        assertEq(fighter.getAccessCount(id), 2);
    }

    function test_LogAccess_UnauthorizedReverts() public {
        uint256 id = _mintTo(alice, keccak256("log-noaccess"));
        address mallory = makeAddr("mallory");
        vm.prank(mallory);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.logAccess(id, 1);
    }

    /// Server-side runner with RUNNER_ROLE can log access for ANY fighter
    /// without per-token executor authorization. Enables the yap-web
    /// inference API route to emit PersonaAccessed on every round.
    function test_LogAccess_RunnerRoleCanLogAnyFighter() public {
        uint256 id1 = _mintTo(alice, keccak256("runner-1"));
        uint256 id2 = _mintTo(bob, keccak256("runner-2"));
        address runner = makeAddr("server-runner");
        bytes32 runnerRole = fighter.RUNNER_ROLE();
        vm.prank(admin);
        fighter.grantRole(runnerRole, runner);

        // Runner logs without being owner or executor of either fighter.
        vm.prank(runner);
        fighter.logAccess(id1, 7);
        vm.prank(runner);
        fighter.logAccess(id2, 7);
        assertEq(fighter.getAccessCount(id1), 1);
        assertEq(fighter.getAccessCount(id2), 1);
    }

    function test_LogAccess_RunnerRoleRevocationStopsAccess() public {
        uint256 id = _mintTo(alice, keccak256("runner-revoke"));
        address runner = makeAddr("runner-rev");
        bytes32 runnerRole = fighter.RUNNER_ROLE();

        vm.prank(admin);
        fighter.grantRole(runnerRole, runner);
        vm.prank(runner);
        fighter.logAccess(id, 1);

        vm.prank(admin);
        fighter.revokeRole(runnerRole, runner);
        vm.prank(runner);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.logAccess(id, 2);
    }

    function test_LogAccess_RevokedExecutorRevertsAfterUnauthorize() public {
        uint256 id = _mintTo(alice, keccak256("log-revoke"));
        address runner = makeAddr("runner");
        vm.prank(alice);
        fighter.authorizeUsage(id, runner, hex"01");
        vm.prank(runner);
        fighter.logAccess(id, 1);
        assertEq(fighter.getAccessCount(id), 1);

        vm.prank(alice);
        fighter.revokeAuthorization(id, runner);
        vm.prank(runner);
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        fighter.logAccess(id, 2);
        assertEq(fighter.getAccessCount(id), 1);
    }

    function test_LogAccess_ZeroBattleIdAllowed() public {
        // battleId == 0 is the convention for non-battle training accesses.
        uint256 id = _mintTo(alice, keccak256("log-train"));
        vm.prank(alice);
        fighter.logAccess(id, 0);
        assertEq(fighter.getAccessCount(id), 1);
    }

    /// A proof attested with chainid X must not validate when the EVM-local
    /// chainid is Y. Simulates a cross-chain replay attempt: build a proof,
    /// compute its proofId WITHOUT chainid (the old format), attest, then
    /// try to consume — the contract's chainid-bound _boundProofId yields
    /// a different slot and {InvalidProof} fires.
    function test_BoundProofId_CrossChainReplayBlocked() public {
        uint256 id = _mintTo(alice, keccak256("xchain"));
        IERC7857.TransferValidityProof memory tvp;
        bytes32 newHash = keccak256("xchain-new");
        // Reuse the helper layout but inject a pre-chainid proofId
        // (the off-chain verifier on the OTHER chain would not include
        // block.chainid in its derivation if it followed the old format).
        IERC7857.AccessProof memory ap = IERC7857.AccessProof(address(0), bytes32(0), hex"");
        bytes memory nonce = abi.encodePacked(bytes32(uint256(77)));
        bytes memory proofBytes = hex"cc";
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: newHash,
            sealedKey: hex"02",
            targetPubkey: hex"",
            nonce: nonce,
            proof: proofBytes
        });
        tvp = IERC7857.TransferValidityProof({accessProof: ap, ownershipProof: op});
        bytes32 oldFormatProofId = keccak256(
            abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof)
        );
        vm.prank(verifier);
        fighter.attestProof(oldFormatProofId, id, bob);

        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;
        vm.prank(alice);
        vm.expectRevert(YapFighter.InvalidProof.selector);
        fighter.iTransferFrom(alice, bob, id, proofs, "ipfs://reseal");
    }

    // ---------------- recordMintScores (TEE-attested persona scoring) ----------------

    uint256 internal constant SCORE_ORACLE_PK = 0xC0DE5C;

    /// Builds a complete attestation envelope for a recordMintScores call
    /// signed by SCORE_ORACLE_PK. Mirrors the BattleEscrow.t.sol helper
    /// shape — wraps the contract's canonical text inside a mock JSON
    /// `{"content":"…"}` body at offset 12.
    struct ScoreArgs {
        bytes responseBody;
        uint256 contentOffset;
        bytes signedText;
        bytes signature;
    }

    function _buildScoreArgs(
        uint256 tokenId,
        bytes32 seedHash,
        uint8[5] memory scoresMem,
        uint256 signerPk
    ) internal view returns (ScoreArgs memory args) {
        // Copy memory array → calldata array via an external view roundtrip
        // by calling scoreCanonicalText which takes uint8[5] calldata.
        uint8[5] memory s = scoresMem;
        bytes memory canonical = bytes(
            this.callScoreCanonicalText(tokenId, seedHash, s)
        );

        args.responseBody = abi.encodePacked('{"content":"', canonical, '"}');
        args.contentOffset = 12;

        bytes32 respSha = sha256(args.responseBody);
        bytes32 dummyReqSha = keccak256("yap-score-req");
        bytes32 dummyTlsFp = keccak256("yap-score-tls");
        args.signedText = abi.encodePacked(
            _hex64(dummyReqSha), ":", _hex64(respSha),
            ":centralized:test:", _hex64(dummyTlsFp)
        );
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(args.signedText);
        (uint8 vv, bytes32 r, bytes32 sig_s) = vm.sign(signerPk, digest);
        args.signature = abi.encodePacked(r, sig_s, vv);
    }

    /// External callable wrapper so we can pass uint8[5] memory through
    /// a calldata boundary into the contract's scoreCanonicalText.
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

    function _setScoreOracle() internal {
        address scoreOracle = vm.addr(SCORE_ORACLE_PK);
        vm.prank(admin);
        fighter.setScoreOracleKey(scoreOracle);
    }

    function _mintWithSeed(address to, bytes32 seedHash, YapFighter.Archetype arch)
        internal
        returns (uint256 id)
    {
        vm.prank(admin);
        id = fighter.mint{value: MINT_FEE}(
            to, "ipfs://score", keccak256("score-meta"), hex"01", arch, seedHash
        );
    }

    function test_RecordMintScores_HappyPath_OwnerCall() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("happy-seed");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Debater);

        uint8[5] memory scores;
        scores[0] = 4; scores[1] = 5; scores[2] = 3; scores[3] = 4; scores[4] = 2;
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        vm.expectEmit(true, true, false, true, address(fighter));
        emit YapFighter.FighterScored(id, alice, YapFighter.Archetype.Debater, scores);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);

        uint8[5] memory got = fighter.getTraits(id);
        assertEq(got[0], 4); assertEq(got[1], 5); assertEq(got[2], 3);
        assertEq(got[3], 4); assertEq(got[4], 2);
        assertTrue(fighter.isScored(id));
    }

    function test_RecordMintScores_RunnerRoleCanCall() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("runner-seed");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Roaster);
        address runner = makeAddr("score-runner");
        bytes32 role = fighter.RUNNER_ROLE();
        vm.prank(admin);
        fighter.grantRole(role, runner);

        uint8[5] memory scores = [uint8(3), 3, 4, 3, 3];
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        vm.prank(runner);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
        assertTrue(fighter.isScored(id));
    }

    function test_RecordMintScores_RevertsOnReplay() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("replay-seed");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Troll);
        uint8[5] memory scores = [uint8(2), 2, 5, 2, 2];
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);

        vm.expectRevert(YapFighter.AlreadyScored.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsOnSeedMismatch() public {
        _setScoreOracle();
        bytes32 mintedSeed = keccak256("real-seed");
        bytes32 fakeSeed = keccak256("fake-seed");
        uint256 id = _mintWithSeed(alice, mintedSeed, YapFighter.Archetype.Scholar);

        uint8[5] memory scores = [uint8(3), 3, 3, 4, 3];
        ScoreArgs memory a = _buildScoreArgs(id, fakeSeed, scores, SCORE_ORACLE_PK);

        vm.expectRevert(YapFighter.SeedMismatch.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, fakeSeed, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsOnScoreBelowMin() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("range-low");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Provocateur);
        uint8[5] memory scores = [uint8(0), 3, 3, 3, 3]; // 0 < MIN_TRAIT_SCORE
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        vm.expectRevert(YapFighter.InvalidScoreRange.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsOnScoreAboveMax() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("range-high");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Roaster);
        uint8[5] memory scores = [uint8(3), 3, 6, 3, 3]; // 6 > MAX_TRAIT_SCORE
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        vm.expectRevert(YapFighter.InvalidScoreRange.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsOnUnauthorized() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("auth-seed");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Debater);
        uint8[5] memory scores = [uint8(3), 3, 3, 3, 3];
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        // bob is neither owner nor a runner.
        vm.expectRevert(YapFighter.NotAuthorized.selector);
        vm.prank(bob);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsWhenOracleKeyUnset() public {
        // No setScoreOracle() — fighter.oracleKey() is address(0).
        bytes32 seedHash = keccak256("no-oracle");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Roaster);
        uint8[5] memory scores = [uint8(3), 3, 3, 3, 3];
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, SCORE_ORACLE_PK);

        vm.expectRevert(YapFighter.NotAuthorized.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_RecordMintScores_RevertsOnWrongSigner() public {
        _setScoreOracle();
        bytes32 seedHash = keccak256("wrong-signer");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Roaster);
        uint8[5] memory scores = [uint8(3), 3, 3, 3, 3];
        // Sign with a different key — recovery will return a non-oracle address.
        ScoreArgs memory a = _buildScoreArgs(id, seedHash, scores, 0xBADBAD);

        vm.expectRevert(TEEAttestationLib.InvalidOracleSignature.selector);
        vm.prank(alice);
        fighter.recordMintScores(id, scores, seedHash, a.responseBody, a.contentOffset, a.signedText, a.signature);
    }

    function test_GetTraits_ReturnsZerosWhenUnscored() public {
        bytes32 seedHash = keccak256("unscored");
        uint256 id = _mintWithSeed(alice, seedHash, YapFighter.Archetype.Roaster);
        uint8[5] memory got = fighter.getTraits(id);
        for (uint256 i = 0; i < 5; ++i) assertEq(got[i], 0);
        assertFalse(fighter.isScored(id));
    }

    function test_SetScoreOracleKey_OnlyAdmin() public {
        address newKey = makeAddr("new-oracle");
        vm.prank(bob);
        vm.expectRevert();
        fighter.setScoreOracleKey(newKey);

        vm.prank(admin);
        fighter.setScoreOracleKey(newKey);
        assertEq(fighter.scoreOracleKey(), newKey);
    }

    function test_SetScoreOracleKey_RevertsOnZero() public {
        vm.prank(admin);
        vm.expectRevert(YapFighter.ZeroAddress.selector);
        fighter.setScoreOracleKey(address(0));
    }
}
