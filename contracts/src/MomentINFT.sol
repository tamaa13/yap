// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {IERC7857} from "./IERC7857.sol";
import {BattleEscrow} from "./BattleEscrow.sol";

interface IFighter {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isExecutor(uint256 tokenId, address executor) external view returns (bool);
}

/// @title MomentINFT — ERC-7857 collectible for outstanding battle rounds.
/// @notice Each token immortalizes one round-side of a Settled Yap battle —
///         the encrypted transcript + reaction blob is sealed off-chain and
///         a per-token re-sealing proof is required on transfer. Mint is
///         permissionless once a battle has Settled in the BattleEscrow and
///         the caller controls the fighter (owner or active rental renter)
///         on the chosen side. Each (battleId, roundNo, side) triple can be
///         minted at most once — clones inherit provenance with a fresh
///         tokenId for collectible serial numbers.
/// @dev Sibling implementation of YapFighter — same ERC-7857 mechanics
///      (sealed-key rotation, bound proof IDs, single-shot consumption,
///      executor authorizations, automatic clearing on transfer) with a
///      battle-bound mint gate replacing the public-fee mint. Tradeable
///      through a separate `YapMarketplace` instance constructed against
///      this contract (the marketplace's `fighterContract` is `immutable`
///      so reuse is by code, not instance).
contract MomentINFT is ERC721, AccessControl, ReentrancyGuard, IERC7857 {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Mirror of YapFighter.PROOF_VALIDITY — keeps moment transfers
    ///         in the same short-lived attestation envelope as fighters.
    uint256 public constant PROOF_VALIDITY = 10 minutes;
    uint256 public constant MAX_EXECUTORS = 100;

    /// @notice Default royalty paid to the original minter on every secondary
    ///         sale that routes through the {YapMarketplace}-compatible
    ///         royalty hook. 250 bps == 2.5%, mirrors the platform fee so
    ///         creator + protocol take the same cut by default. The minter
    ///         may raise or lower this per-token up to {MAX_ROYALTY_BPS}.
    uint96 public constant DEFAULT_ROYALTY_BPS = 250;
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10% — hard ceiling
    uint96 public constant ROYALTY_BPS_DENOMINATOR = 10_000;

    address public override verifier;
    address public treasury;
    uint256 public mintFee;

    BattleEscrow public immutable escrow;
    IFighter public immutable fighterContract;

    uint256 private _nextId;

    mapping(uint256 => bytes32) public metadataHash;
    mapping(uint256 => string) public encryptedURI;
    mapping(uint256 => bytes) public sealedKeys;

    /// @notice Provenance for each minted moment — links the token back to
    ///         the battle round it commemorates. Populated at mint and
    ///         never mutated. Clones inherit parent provenance verbatim
    ///         (same battle/round/side, new serial).
    struct Provenance {
        uint256 battleId;
        uint256 fighterTokenId;
        bytes32 provenanceHash;
        uint16 roundNo;
        uint8 side;
    }
    mapping(uint256 => Provenance) public momentOf;

    /// @notice Uniqueness gate keyed by `keccak256(battleId, roundNo, side)`
    ///         — each (battle, round, side) triple is mintable exactly once
    ///         as the canonical "first edition". Subsequent collectible
    ///         serials of the same moment are produced via {iCloneFrom}.
    mapping(bytes32 => bool) public momentClaimed;

    /// @notice Per-token royalty record. {minter} is the address that called
    ///         {mintMoment} for this collectible — clones inherit the same
    ///         minter so the original creator keeps the cut across serials.
    ///         {royaltyBps} is bounded by {MAX_ROYALTY_BPS}; reads through
    ///         the standard EIP-2981 {royaltyInfo} surface.
    struct RoyaltyInfo {
        address minter;
        uint96 royaltyBps;
    }
    mapping(uint256 => RoyaltyInfo) private _royalties;

    mapping(uint256 => mapping(address => bytes)) public authorizations;
    mapping(uint256 => address[]) private _executors;
    mapping(uint256 => mapping(address => uint256)) private _executorIndex;

    mapping(bytes32 => uint256) private _proofIssuedAt;
    mapping(bytes32 => bool) private _proofConsumed;

    event MomentMinted(
        uint256 indexed tokenId,
        uint256 indexed battleId,
        uint256 indexed fighterTokenId,
        uint16 roundNo,
        uint8 side,
        address minter,
        bytes32 metadataHash,
        string encryptedURI,
        bytes32 provenanceHash
    );
    /// @notice Fired any time a token's royalty record changes — on the
    ///         initial mint (newBps == DEFAULT_ROYALTY_BPS) and whenever the
    ///         minter calls {setRoyalty}. Lets indexers track the active
    ///         creator cut without re-reading state.
    event RoyaltySet(
        uint256 indexed tokenId,
        address indexed minter,
        uint96 royaltyBps
    );

    error InvalidProof();
    error ProofExpired();
    error ProofAlreadyConsumed();
    error ExecutorCapReached();
    error ZeroAddress();
    error NotAuthorized();
    error IncorrectFee();
    error BattleNotSettled();
    error InvalidRound();
    error InvalidSide();
    error NotFighterUser();
    error MomentAlreadyClaimed();
    error MintNotSupported();
    error RoyaltyTooHigh();
    error NotMinter();

    constructor(
        address admin,
        address verifier_,
        address treasury_,
        address escrow_,
        address fighterContract_,
        uint256 mintFee_
    ) ERC721("Yap Moment", "YMNT") {
        if (
            admin == address(0) ||
            verifier_ == address(0) ||
            treasury_ == address(0) ||
            escrow_ == address(0) ||
            fighterContract_ == address(0)
        ) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        verifier = verifier_;
        treasury = treasury_;
        mintFee = mintFee_;
        escrow = BattleEscrow(escrow_);
        fighterContract = IFighter(fighterContract_);
    }

    // --------------------------------------------------------------------------------------------
    // Admin
    // --------------------------------------------------------------------------------------------

    function setVerifier(address verifier_) external onlyRole(ADMIN_ROLE) {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = verifier_;
    }

    function setTreasury(address treasury_) external onlyRole(ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    function setMintFee(uint256 mintFee_) external onlyRole(ADMIN_ROLE) {
        mintFee = mintFee_;
    }

    // --------------------------------------------------------------------------------------------
    // ERC-7857
    // --------------------------------------------------------------------------------------------

    /// @notice Disabled — use {mintMoment}. Kept payable to satisfy the
    ///         IERC7857 interface; reverts unconditionally so callers see
    ///         a typed error instead of a silent ABI mismatch.
    function mint(
        address,
        string memory,
        bytes32,
        bytes memory
    ) external payable override returns (uint256) {
        revert MintNotSupported();
    }

    /// @notice Mint a moment INFT for a settled battle round. Caller must
    ///         control the fighter on the chosen side (direct owner or an
    ///         active rental renter via YapFighter.authorizations).
    /// @param battleId               BattleEscrow id (must be Settled).
    /// @param roundNo                1-indexed round (≤ Battle.maxRounds).
    /// @param side                   0 = side A (fighterA), 1 = side B.
    /// @param encryptedTranscriptURI 0G Storage / IPFS URI of the encrypted
    ///                               round transcript + reaction blob.
    /// @param metadataHash_          keccak commitment to the off-chain blob.
    /// @param sealedKey              Sealed symmetric key for the minter.
    /// @param provenanceHash         Off-chain commitment (transcript root,
    ///                               reaction tally, etc.) used by indexers
    ///                               to rank "highest reaction" moments.
    ///                               Opaque to the contract — no on-chain
    ///                               verification.
    function mintMoment(
        uint256 battleId,
        uint16 roundNo,
        uint8 side,
        string calldata encryptedTranscriptURI,
        bytes32 metadataHash_,
        bytes calldata sealedKey,
        bytes32 provenanceHash
    ) external payable nonReentrant returns (uint256 tokenId) {
        if (msg.value != mintFee) revert IncorrectFee();
        if (side > 1) revert InvalidSide();
        if (bytes(encryptedTranscriptURI).length == 0) revert InvalidProof();
        if (metadataHash_ == bytes32(0)) revert InvalidProof();

        BattleEscrow.Battle memory b = escrow.getBattle(battleId);
        if (b.status != BattleEscrow.Status.Settled) revert BattleNotSettled();
        if (roundNo == 0 || roundNo > b.maxRounds) revert InvalidRound();

        uint256 fighterTokenId = side == 0 ? b.fighterA : b.fighterB;
        if (
            fighterContract.ownerOf(fighterTokenId) != msg.sender &&
            !fighterContract.isExecutor(fighterTokenId, msg.sender)
        ) revert NotFighterUser();

        bytes32 key = keccak256(abi.encode(battleId, roundNo, side));
        if (momentClaimed[key]) revert MomentAlreadyClaimed();
        momentClaimed[key] = true;

        if (mintFee > 0) Address.sendValue(payable(treasury), mintFee);

        tokenId = ++_nextId;
        _safeMint(msg.sender, tokenId);
        metadataHash[tokenId] = metadataHash_;
        encryptedURI[tokenId] = encryptedTranscriptURI;
        sealedKeys[tokenId] = sealedKey;
        momentOf[tokenId] = Provenance({
            battleId: battleId,
            fighterTokenId: fighterTokenId,
            provenanceHash: provenanceHash,
            roundNo: roundNo,
            side: side
        });
        _setRoyalty(tokenId, msg.sender, DEFAULT_ROYALTY_BPS);

        emit Minted(tokenId, msg.sender, metadataHash_, encryptedTranscriptURI);
        emit PublishedSealedKey(tokenId, msg.sender, sealedKey);
        emit MomentMinted(
            tokenId,
            battleId,
            fighterTokenId,
            roundNo,
            side,
            msg.sender,
            metadataHash_,
            encryptedTranscriptURI,
            provenanceHash
        );
    }

    function iTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs,
        string calldata newEncryptedURI
    ) external override nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (bytes(newEncryptedURI).length == 0) revert InvalidProof();
        if (ownerOf(tokenId) != from) revert NotAuthorized();
        // Self-custodial: only the token owner can transfer with re-encryption.
        if (msg.sender != from) revert NotAuthorized();
        if (proofs.length == 0) revert InvalidProof();

        OwnershipProof calldata op = proofs[proofs.length - 1].ownershipProof;
        _requireFreshProof(op, tokenId, to);
        if (op.dataHash == bytes32(0)) revert InvalidProof();
        _consumeProof(op, tokenId, to);

        _clearAuthorizations(tokenId);

        metadataHash[tokenId] = op.dataHash;
        encryptedURI[tokenId] = newEncryptedURI;
        sealedKeys[tokenId] = op.sealedKey;

        _transfer(from, to, tokenId);

        emit Transferred(tokenId, from, to, op.dataHash);
        emit PublishedSealedKey(tokenId, to, op.sealedKey);
    }

    function iCloneFrom(
        address to,
        uint256 tokenId,
        TransferValidityProof calldata proof
    ) external override nonReentrant returns (uint256 newTokenId) {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();

        _requireFreshProof(proof.ownershipProof, tokenId, to);
        if (proof.ownershipProof.dataHash == bytes32(0)) revert InvalidProof();
        _consumeProof(proof.ownershipProof, tokenId, to);

        newTokenId = ++_nextId;
        _safeMint(to, newTokenId);
        metadataHash[newTokenId] = proof.ownershipProof.dataHash;
        encryptedURI[newTokenId] = encryptedURI[tokenId];
        sealedKeys[newTokenId] = proof.ownershipProof.sealedKey;
        // Inherit provenance + royalty — clones are additional serials of
        // the same moment, so the original minter keeps the secondary cut.
        momentOf[newTokenId] = momentOf[tokenId];
        RoyaltyInfo memory parent = _royalties[tokenId];
        _setRoyalty(newTokenId, parent.minter, parent.royaltyBps);

        emit Cloned(tokenId, newTokenId, to, proof.ownershipProof.dataHash);
        emit PublishedSealedKey(newTokenId, to, proof.ownershipProof.sealedKey);
    }

    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external override {
        if (ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        if (executor == address(0)) revert ZeroAddress();

        if (_executorIndex[tokenId][executor] == 0) {
            if (_executors[tokenId].length >= MAX_EXECUTORS) revert ExecutorCapReached();
            _executors[tokenId].push(executor);
            _executorIndex[tokenId][executor] = _executors[tokenId].length;
        }
        authorizations[tokenId][executor] = permissions;

        emit UsageAuthorized(tokenId, executor, permissions);
    }

    function revokeAuthorization(uint256 tokenId, address executor) external override {
        if (ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        _removeExecutor(tokenId, executor);

        emit UsageRevoked(tokenId, executor);
    }

    // --------------------------------------------------------------------------------------------
    // Proof helpers
    // --------------------------------------------------------------------------------------------

    function attestProof(bytes32 proofId, uint256 tokenId, address recipient) external {
        if (msg.sender != verifier) revert NotAuthorized();
        bytes32 boundId = keccak256(abi.encode(proofId, tokenId, recipient));
        _proofIssuedAt[boundId] = block.timestamp;
    }

    function _requireFreshProof(
        OwnershipProof calldata op,
        uint256 tokenId,
        address recipient
    ) internal view {
        bytes32 boundId = _boundProofId(op, tokenId, recipient);
        uint256 issued = _proofIssuedAt[boundId];
        if (issued == 0) revert InvalidProof();
        if (block.timestamp > issued + PROOF_VALIDITY) revert ProofExpired();
        if (_proofConsumed[boundId]) revert ProofAlreadyConsumed();
    }

    function _consumeProof(
        OwnershipProof calldata op,
        uint256 tokenId,
        address recipient
    ) internal {
        _proofConsumed[_boundProofId(op, tokenId, recipient)] = true;
    }

    function _boundProofId(
        OwnershipProof calldata op,
        uint256 tokenId,
        address recipient
    ) internal pure returns (bytes32) {
        bytes32 id = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
        return keccak256(abi.encode(id, tokenId, recipient));
    }

    // --------------------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------------------

    function isExecutor(uint256 tokenId, address executor) external view returns (bool) {
        return _executorIndex[tokenId][executor] != 0;
    }

    function executorCount(uint256 tokenId) external view returns (uint256) {
        return _executors[tokenId].length;
    }

    function executorsOf(uint256 tokenId) external view returns (address[] memory) {
        return _executors[tokenId];
    }

    function isMomentClaimed(uint256 battleId, uint16 roundNo, uint8 side)
        external
        view
        returns (bool)
    {
        return momentClaimed[keccak256(abi.encode(battleId, roundNo, side))];
    }

    // --------------------------------------------------------------------------------------------
    // Royalty (EIP-2981 + named view per brief)
    // --------------------------------------------------------------------------------------------

    /// @notice Named view per brief — returns the recorded minter and the
    ///         bps cut for `tokenId`. Companion to {royaltyInfo}, which
    ///         exposes the same data through the standard EIP-2981 shape
    ///         that marketplaces probe via staticcall.
    function getRoyaltyInfo(uint256 tokenId)
        external
        view
        returns (address minter, uint96 royaltyBps)
    {
        RoyaltyInfo memory r = _royalties[tokenId];
        return (r.minter, r.royaltyBps);
    }

    /// @notice EIP-2981 royalty resolver. `receiver` is the original minter
    ///         (or zero for unminted/burned ids); `royaltyAmount` is
    ///         `salePrice * royaltyBps / 10_000`. Marketplaces should call
    ///         this with the sale's gross price before fee deduction.
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        RoyaltyInfo memory r = _royalties[tokenId];
        receiver = r.minter;
        royaltyAmount = (salePrice * uint256(r.royaltyBps)) / uint256(ROYALTY_BPS_DENOMINATOR);
    }

    /// @notice Override the per-token royalty cut. Only the recorded minter
    ///         can call — admins are intentionally excluded so creators can
    ///         negotiate their own rates. New bps cannot exceed
    ///         {MAX_ROYALTY_BPS}; minter address is immutable post-mint.
    function setRoyalty(uint256 tokenId, uint96 royaltyBps) external {
        RoyaltyInfo storage r = _royalties[tokenId];
        if (r.minter == address(0)) revert NotMinter();
        if (msg.sender != r.minter) revert NotMinter();
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        r.royaltyBps = royaltyBps;
        emit RoyaltySet(tokenId, r.minter, royaltyBps);
    }

    function _setRoyalty(uint256 tokenId, address minter, uint96 royaltyBps) internal {
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        _royalties[tokenId] = RoyaltyInfo({minter: minter, royaltyBps: royaltyBps});
        emit RoyaltySet(tokenId, minter, royaltyBps);
    }

    // --------------------------------------------------------------------------------------------
    // Internals
    // --------------------------------------------------------------------------------------------

    function _clearAuthorizations(uint256 tokenId) internal {
        address[] storage list = _executors[tokenId];
        uint256 n = list.length;
        for (uint256 i = 0; i < n; ++i) {
            address exec = list[i];
            delete authorizations[tokenId][exec];
            delete _executorIndex[tokenId][exec];
        }
        delete _executors[tokenId];
    }

    function _removeExecutor(uint256 tokenId, address executor) internal {
        uint256 idx1 = _executorIndex[tokenId][executor];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        address[] storage list = _executors[tokenId];
        uint256 lastIdx = list.length - 1;
        if (idx != lastIdx) {
            address last = list[lastIdx];
            list[idx] = last;
            _executorIndex[tokenId][last] = idx1;
        }
        list.pop();
        delete _executorIndex[tokenId][executor];
        delete authorizations[tokenId][executor];
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            _clearAuthorizations(tokenId);
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IERC7857).interfaceId ||
            // EIP-2981 royaltyInfo(uint256,uint256) selector pair → interface id 0x2a55205a.
            interfaceId == 0x2a55205a ||
            super.supportsInterface(interfaceId);
    }
}
