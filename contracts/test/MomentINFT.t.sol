// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {MomentINFT} from "../src/MomentINFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {IERC7857} from "../src/IERC7857.sol";

/// @dev Stub that exposes the same `getBattle` ABI as BattleEscrow without
///      walking the full create→accept→verdict→settle lifecycle. Tests
///      assemble the Battle they need and store it directly.
contract MockBattleEscrow {
    mapping(uint256 => BattleEscrow.Battle) private _battles;

    function setBattle(uint256 id, BattleEscrow.Battle memory b) external {
        _battles[id] = b;
    }

    function getBattle(uint256 id) external view returns (BattleEscrow.Battle memory) {
        return _battles[id];
    }
}

/// @dev Minimal fighter stub mirroring the IFighter surface MomentINFT
///      reads — `ownerOf` + `isExecutor`. Real YapFighter behaviour
///      (revert on missing tokens) is not needed for these tests; an
///      unset owner returns address(0) which still trips NotFighterUser.
contract MockFighter {
    mapping(uint256 => address) public ownerOfMap;
    mapping(uint256 => mapping(address => bool)) public executorsMap;

    function setOwner(uint256 id, address o) external {
        ownerOfMap[id] = o;
    }

    function setExecutor(uint256 id, address e, bool v) external {
        executorsMap[id][e] = v;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return ownerOfMap[id];
    }

    function isExecutor(uint256 id, address e) external view returns (bool) {
        return executorsMap[id][e];
    }
}

contract MomentINFTTest is Test {
    MomentINFT internal moment;
    MockBattleEscrow internal escrow;
    MockFighter internal fighter;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant FIGHTER_A = 1;
    uint256 internal constant FIGHTER_B = 2;
    uint256 internal constant BATTLE_ID = 9;
    uint16 internal constant ROUND_NO = 2;
    uint8 internal constant SIDE_A = 0;
    uint8 internal constant SIDE_B = 1;

    string internal constant URI_1 = "ipfs://moment/1";
    string internal constant URI_NEW = "ipfs://moment/new";

    function setUp() public {
        escrow = new MockBattleEscrow();
        fighter = new MockFighter();
        moment = new MomentINFT(
            admin,
            verifier,
            treasury,
            address(escrow),
            address(fighter),
            0
        );

        // Fighter A → alice, Fighter B → bob. Battle 9 = Settled, A=winner.
        fighter.setOwner(FIGHTER_A, alice);
        fighter.setOwner(FIGHTER_B, bob);
        _setBattle(BATTLE_ID, FIGHTER_A, FIGHTER_B, 3, BattleEscrow.Status.Settled, 0);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ---------------- helpers ----------------

    function _setBattle(
        uint256 id,
        uint256 fA,
        uint256 fB,
        uint32 maxRounds,
        BattleEscrow.Status status,
        uint8 winner
    ) internal {
        BattleEscrow.Battle memory b;
        b.fighterA = fA;
        b.fighterB = fB;
        b.creator = address(0xC4EA);
        b.startTime = uint64(block.timestamp);
        b.verdictTime = uint64(block.timestamp);
        b.maxRounds = maxRounds;
        b.winner = winner;
        b.status = status;
        b.poolA = 1 ether;
        b.poolB = 1 ether;
        b.feeCollected = 0;
        b.topic = "anything";
        b.verdictSig = hex"";
        b.verdictHash = keccak256("v");
        b.totalClaimed = 0;
        b.settledAt = uint64(block.timestamp);
        escrow.setBattle(id, b);
    }

    function _mintMoment(
        address caller,
        uint8 side,
        uint16 round
    ) internal returns (uint256 id) {
        vm.prank(caller);
        id = moment.mintMoment(
            BATTLE_ID,
            round,
            side,
            URI_1,
            keccak256(abi.encode("metadata", side, round)),
            hex"01",
            keccak256(abi.encode("provenance", side, round))
        );
    }

    function _buildAttestedProof(
        bytes32 newHash,
        bytes memory sealedKey,
        uint256 tokenId,
        address recipient
    ) internal returns (IERC7857.TransferValidityProof memory tvp) {
        IERC7857.AccessProof memory ap = IERC7857.AccessProof({
            subscriber: address(0),
            tokenIntent: bytes32(0),
            signature: ""
        });
        bytes memory nonce = abi.encodePacked(bytes32(uint256(7)));
        bytes memory proofBytes = hex"aa";
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: newHash,
            sealedKey: sealedKey,
            targetPubkey: hex"",
            nonce: nonce,
            proof: proofBytes
        });
        tvp = IERC7857.TransferValidityProof({accessProof: ap, ownershipProof: op});
        bytes32 proofId = keccak256(
            abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof, block.chainid)
        );
        vm.prank(verifier);
        moment.attestProof(proofId, tokenId, recipient);
    }

    // ---------------- mint ----------------

    function test_MintMoment_Succeeds_AssignsOwnerAndProvenance() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        assertEq(moment.ownerOf(id), alice);
        (
            uint256 battleId,
            uint256 fighterTokenId,
            bytes32 provenanceHash,
            uint16 roundNo,
            uint8 side
        ) = moment.momentOf(id);
        assertEq(battleId, BATTLE_ID);
        assertEq(fighterTokenId, FIGHTER_A);
        assertEq(provenanceHash, keccak256(abi.encode("provenance", SIDE_A, ROUND_NO)));
        assertEq(roundNo, ROUND_NO);
        assertEq(side, SIDE_A);
        assertEq(moment.encryptedURI(id), URI_1);
        assertTrue(moment.isMomentClaimed(BATTLE_ID, ROUND_NO, SIDE_A));
    }

    function test_MintMoment_RevertsWhenBattleNotSettled() public {
        _setBattle(BATTLE_ID, FIGHTER_A, FIGHTER_B, 3, BattleEscrow.Status.Live, 0);
        vm.prank(alice);
        vm.expectRevert(MomentINFT.BattleNotSettled.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_RevertsOnZeroRound() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidRound.selector);
        moment.mintMoment(BATTLE_ID, 0, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_RevertsOnRoundExceedingMax() public {
        // maxRounds = 3, round 4 must revert.
        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidRound.selector);
        moment.mintMoment(BATTLE_ID, 4, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_RevertsOnInvalidSide() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidSide.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, 2, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_RevertsForNonFighterUser() public {
        // Caller doesn't own or have executor authorization on either fighter.
        address mallory = makeAddr("mallory");
        vm.prank(mallory);
        vm.expectRevert(MomentINFT.NotFighterUser.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_AllowsExecutor() public {
        // Bob doesn't own fighterA, but is an active rental renter (executor).
        address renter = makeAddr("renter");
        fighter.setExecutor(FIGHTER_A, renter, true);
        vm.prank(renter);
        uint256 id = moment.mintMoment(
            BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0)
        );
        assertEq(moment.ownerOf(id), renter);
    }

    function test_MintMoment_RevertsOnDuplicateTriple() public {
        _mintMoment(alice, SIDE_A, ROUND_NO);
        vm.prank(alice);
        vm.expectRevert(MomentINFT.MomentAlreadyClaimed.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_AllowsBothSidesSameRound() public {
        uint256 idA = _mintMoment(alice, SIDE_A, ROUND_NO);
        uint256 idB = _mintMoment(bob, SIDE_B, ROUND_NO);
        assertEq(moment.ownerOf(idA), alice);
        assertEq(moment.ownerOf(idB), bob);
        assertTrue(idA != idB);
    }

    function test_MintMoment_AllowsDifferentRoundsSameSide() public {
        uint256 id1 = _mintMoment(alice, SIDE_A, 1);
        uint256 id2 = _mintMoment(alice, SIDE_A, 2);
        uint256 id3 = _mintMoment(alice, SIDE_A, 3);
        assertEq(moment.ownerOf(id1), alice);
        assertEq(moment.ownerOf(id2), alice);
        assertEq(moment.ownerOf(id3), alice);
    }

    function test_MintMoment_RevertsOnIncorrectFee() public {
        vm.prank(admin);
        moment.setMintFee(0.05 ether);
        vm.prank(alice);
        vm.expectRevert(MomentINFT.IncorrectFee.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_ForwardsFeeToTreasury() public {
        vm.prank(admin);
        moment.setMintFee(0.05 ether);
        uint256 before = treasury.balance;
        vm.prank(alice);
        moment.mintMoment{value: 0.05 ether}(
            BATTLE_ID, ROUND_NO, SIDE_A, URI_1, keccak256("m"), hex"01", bytes32(0)
        );
        assertEq(treasury.balance - before, 0.05 ether);
    }

    function test_MintMoment_RevertsOnEmptyURI() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidProof.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, "", keccak256("m"), hex"01", bytes32(0));
    }

    function test_MintMoment_RevertsOnZeroMetadataHash() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidProof.selector);
        moment.mintMoment(BATTLE_ID, ROUND_NO, SIDE_A, URI_1, bytes32(0), hex"01", bytes32(0));
    }

    function test_Mint_IERC7857_Reverts_UseMintMomentInstead() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.MintNotSupported.selector);
        moment.mint(alice, "ipfs://x", keccak256("a"), hex"01");
    }

    // ---------------- transfer ----------------

    function test_ITransferFrom_TransfersAndUpdatesMetadata() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        moment.iTransferFrom(alice, bob, id, proofs, URI_NEW);

        assertEq(moment.ownerOf(id), bob);
        assertEq(moment.metadataHash(id), keccak256("m2"));
        assertEq(moment.encryptedURI(id), URI_NEW);
    }

    function test_ITransferFrom_RevertsWhenProofUnattested() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.OwnershipProof memory op = IERC7857.OwnershipProof({
            oracleType: 0,
            dataHash: keccak256("m2"),
            sealedKey: hex"02",
            targetPubkey: hex"",
            nonce: abi.encodePacked(bytes32(uint256(11))),
            proof: hex"deadbeef"
        });
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = IERC7857.TransferValidityProof({
            accessProof: IERC7857.AccessProof(address(0), bytes32(0), ""),
            ownershipProof: op
        });

        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidProof.selector);
        moment.iTransferFrom(alice, bob, id, proofs, URI_NEW);
    }

    function test_ITransferFrom_RevertsWhenProofExpired() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.warp(block.timestamp + moment.PROOF_VALIDITY() + 1);

        vm.prank(alice);
        vm.expectRevert(MomentINFT.ProofExpired.selector);
        moment.iTransferFrom(alice, bob, id, proofs, URI_NEW);
    }

    function test_ITransferFrom_ProofBoundToTokenAndRecipient() public {
        // Mint two moments to alice. Proof attested for moment #1 → bob
        // must not be reusable for moment #2 → bob.
        uint256 id1 = _mintMoment(alice, SIDE_A, 1);
        uint256 id2 = _mintMoment(alice, SIDE_A, 2);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("m2"), hex"02", id1, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        vm.expectRevert(MomentINFT.InvalidProof.selector);
        moment.iTransferFrom(alice, bob, id2, proofs, URI_NEW);

        // Same proof against the correct token succeeds.
        vm.prank(alice);
        moment.iTransferFrom(alice, bob, id1, proofs, URI_NEW);
        assertEq(moment.ownerOf(id1), bob);
    }

    function test_ITransferFrom_RevertsForNonOwnerCaller() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(bob);
        vm.expectRevert(MomentINFT.NotAuthorized.selector);
        moment.iTransferFrom(alice, bob, id, proofs, URI_NEW);
    }

    function test_ITransferFrom_ClearsAuthorizations() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        address exec = makeAddr("exec");
        vm.prank(alice);
        moment.authorizeUsage(id, exec, hex"ff");
        assertTrue(moment.isExecutor(id, exec));

        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("m2"), hex"02", id, bob);
        IERC7857.TransferValidityProof[] memory proofs = new IERC7857.TransferValidityProof[](1);
        proofs[0] = tvp;

        vm.prank(alice);
        moment.iTransferFrom(alice, bob, id, proofs, URI_NEW);

        assertFalse(moment.isExecutor(id, exec));
        assertEq(moment.executorCount(id), 0);
    }

    // ---------------- clone ----------------

    function test_ICloneFrom_InheritsProvenance() public {
        uint256 parentId = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("mClone"), hex"03", parentId, bob);

        vm.prank(alice);
        uint256 cloneId = moment.iCloneFrom(bob, parentId, tvp);

        assertEq(moment.ownerOf(cloneId), bob);
        assertEq(moment.ownerOf(parentId), alice);
        (
            uint256 pBattleId,
            uint256 pFighterId,
            bytes32 pHash,
            uint16 pRound,
            uint8 pSide
        ) = moment.momentOf(cloneId);
        (
            uint256 oBattleId,
            uint256 oFighterId,
            bytes32 oHash,
            uint16 oRound,
            uint8 oSide
        ) = moment.momentOf(parentId);
        assertEq(pBattleId, oBattleId);
        assertEq(pFighterId, oFighterId);
        assertEq(pHash, oHash);
        assertEq(pRound, oRound);
        assertEq(pSide, oSide);
    }

    function test_ICloneFrom_RevertsForNonOwner() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        IERC7857.TransferValidityProof memory tvp =
            _buildAttestedProof(keccak256("mClone"), hex"03", id, bob);

        vm.prank(bob);
        vm.expectRevert(MomentINFT.NotAuthorized.selector);
        moment.iCloneFrom(bob, id, tvp);
    }

    // ---------------- authorize / revoke ----------------

    function test_Authorize_AddsExecutor() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        address exec = makeAddr("exec");
        vm.prank(alice);
        moment.authorizeUsage(id, exec, hex"aa");
        assertTrue(moment.isExecutor(id, exec));
        assertEq(moment.authorizations(id, exec), hex"aa");
    }

    function test_Authorize_RevertsForNonOwner() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        vm.prank(bob);
        vm.expectRevert(MomentINFT.NotAuthorized.selector);
        moment.authorizeUsage(id, makeAddr("exec"), hex"aa");
    }

    function test_Revoke_RemovesExecutor() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        address exec = makeAddr("exec");
        vm.startPrank(alice);
        moment.authorizeUsage(id, exec, hex"aa");
        moment.revokeAuthorization(id, exec);
        vm.stopPrank();
        assertFalse(moment.isExecutor(id, exec));
    }

    // ---------------- admin / interface ----------------

    function test_AttestProof_OnlyVerifier() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.NotAuthorized.selector);
        moment.attestProof(keccak256("x"), 1, bob);
    }

    function test_SetVerifier_OnlyAdmin() public {
        address v2 = makeAddr("v2");
        vm.prank(alice);
        vm.expectRevert();
        moment.setVerifier(v2);
        vm.prank(admin);
        moment.setVerifier(v2);
        assertEq(moment.verifier(), v2);
    }

    function test_SupportsInterface_IncludesERC7857() public view {
        assertTrue(moment.supportsInterface(type(IERC7857).interfaceId));
    }

    // ---------------- royalty (EIP-2981) ----------------

    function test_Royalty_SetOnMint_DefaultBps() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        (address minter, uint96 bps) = moment.getRoyaltyInfo(id);
        assertEq(minter, alice);
        assertEq(bps, moment.DEFAULT_ROYALTY_BPS());
    }

    function test_Royalty_Info_ProportionalToSalePrice() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        // 250 bps == 2.5%. 1e18 * 0.025 = 2.5e16.
        (address receiver, uint256 amount) = moment.royaltyInfo(id, 1 ether);
        assertEq(receiver, alice);
        assertEq(amount, 0.025 ether);
    }

    function test_Royalty_ClonedTokenInheritsMinterAndBps() public {
        uint256 parent = _mintMoment(alice, SIDE_A, ROUND_NO);
        // Bump parent bps so we can prove the clone copies the override too.
        vm.prank(alice);
        moment.setRoyalty(parent, 500);

        IERC7857.TransferValidityProof memory tvp = _buildAttestedProof(
            keccak256("clone-meta"), hex"02", parent, bob
        );
        vm.prank(alice);
        uint256 cloneId = moment.iCloneFrom(bob, parent, tvp);

        (address pm, uint96 pb) = moment.getRoyaltyInfo(parent);
        (address cm, uint96 cb) = moment.getRoyaltyInfo(cloneId);
        assertEq(pm, cm);
        assertEq(pb, cb);
        assertEq(cm, alice);
        assertEq(cb, 500);
    }

    function test_Royalty_SetRoyalty_OnlyMinter() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        vm.prank(bob);
        vm.expectRevert(MomentINFT.NotMinter.selector);
        moment.setRoyalty(id, 400);
    }

    function test_Royalty_SetRoyalty_RejectsAboveMax() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        uint96 tooHigh = moment.MAX_ROYALTY_BPS() + 1;
        vm.prank(alice);
        vm.expectRevert(MomentINFT.RoyaltyTooHigh.selector);
        moment.setRoyalty(id, tooHigh);
    }

    function test_Royalty_SetRoyalty_EmitsAndUpdates() public {
        uint256 id = _mintMoment(alice, SIDE_A, ROUND_NO);
        vm.expectEmit(true, true, false, true, address(moment));
        emit MomentINFT.RoyaltySet(id, alice, 750);
        vm.prank(alice);
        moment.setRoyalty(id, 750);
        (, uint96 bps) = moment.getRoyaltyInfo(id);
        assertEq(bps, 750);
    }

    function test_Royalty_SetRoyalty_UnmintedTokenReverts() public {
        vm.prank(alice);
        vm.expectRevert(MomentINFT.NotMinter.selector);
        moment.setRoyalty(999, 100);
    }

    function test_SupportsInterface_IncludesERC2981() public view {
        // EIP-2981 interface id == 0x2a55205a.
        assertTrue(moment.supportsInterface(0x2a55205a));
    }
}
