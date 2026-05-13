// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";
import {IERC7857} from "./IERC7857.sol";
import {TEEAttestationLib} from "./TEEAttestationLib.sol";

/// @title YapFighter — ERC-7857 Intelligent NFT for Yap AI combat arena.
/// @notice Each token represents an AI fighter whose encrypted weights live off-chain.
///         Ownership transfers require a re-sealing proof (TEE/ZK) verified by {verifier}.
contract YapFighter is ERC721, AccessControl, ReentrancyGuard, IERC7857 {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    /// @notice Server-side runner address(es) authorized to write to the
    ///         persona audit log via {logAccess}. Granted to the off-chain
    ///         inference runner so it can emit {PersonaAccessed} on every
    ///         decryption round without needing per-token executor wiring.
    ///         Owner + executor paths remain functional in parallel.
    bytes32 public constant RUNNER_ROLE = keccak256("RUNNER_ROLE");

    /// @notice Ownership proofs expire after this window. Tightened from 1
    ///         hour to 10 minutes to reduce replay surface for stale proofs
    ///         (industry standard for short-lived ownership attestations).
    uint256 public constant PROOF_VALIDITY = 10 minutes;
    uint256 public constant MAX_EXECUTORS = 100;

    /// @notice Fighter archetype, committed at mint and immutable thereafter.
    ///         Each archetype unlocks a specific ability that AbilityEscrow
    ///         gates on the fighter's trait score crossing a threshold.
    ///         Stored as a uint8 so the enum surface stays cheap.
    enum Archetype {
        Roaster,       // 0 — gated on Aggression
        Debater,       // 1 — gated on Logos
        Philosopher,   // 2 — gated on Logos
        Troll,         // 3 — gated on Aggression
        Scholar,       // 4 — gated on Range
        Provocateur    // 5 — gated on Rhetoric
    }

    /// @notice Minimum and maximum allowed values for each persona trait
    ///         in {recordMintScores}. The TEE-judged rubric anchors at
    ///         a 1-5 ordinal scale; values outside the band signal either
    ///         a buggy judge or a tampered response.
    uint8 public constant MIN_TRAIT_SCORE = 1;
    uint8 public constant MAX_TRAIT_SCORE = 5;

    address public override verifier;
    address public treasury;
    uint256 public mintFee;

    uint256 private _nextId;

    mapping(uint256 => bytes32) public metadataHash;
    mapping(uint256 => string) public encryptedURI;
    mapping(uint256 => bytes) public sealedKeys;

    mapping(uint256 => mapping(address => bytes)) public authorizations;
    mapping(uint256 => address[]) private _executors;
    mapping(uint256 => mapping(address => uint256)) private _executorIndex; // 1-based

    mapping(bytes32 => uint256) private _proofIssuedAt;
    /// @notice Whether a (proofId, tokenId, recipient) triple has already
    ///         been consumed by iTransferFrom / iCloneFrom. Belt-and-
    ///         suspenders against proof reuse within the validity window
    ///         — iTransferFrom is structurally protected by ownership
    ///         atomicity, but iCloneFrom would otherwise let an owner
    ///         mint N clones from one attestation.
    mapping(bytes32 => bool) private _proofConsumed;

    /// @notice Monotonic per-token counter of audited persona accesses.
    ///         Incremented by {logAccess} once per persona-decryption event
    ///         (one per battle round on the runner side). Exposed via
    ///         {getAccessCount} so UIs can render lifetime usage stats
    ///         without scanning logs.
    mapping(uint256 => uint256) private _accessCount;

    /// @notice Per-token persona archetype, set at {mint} and never mutated.
    ///         Drives the ability lookup in AbilityEscrow.useAbility.
    mapping(uint256 => Archetype) private _archetypeOf;

    /// @notice Commitment to the off-chain JSONL persona seed. Captured at
    ///         {mint} so the TEE scoring path can prove the scores belong
    ///         to this specific seed (prevents swap attacks where an
    ///         attacker submits scores from a different fighter's seed).
    mapping(uint256 => bytes32) private _seedHashOf;

    /// @notice Packed 5-byte trait vector, set once via {recordMintScores}.
    ///         Layout: byte[0]=Logos, [1]=Rhetoric, [2]=Aggression,
    ///         [3]=Range, [4]=Concreteness. Each value bounded
    ///         {MIN_TRAIT_SCORE}..{MAX_TRAIT_SCORE}. Unpack via {getTraits}.
    mapping(uint256 => bytes5) private _traitsOf;

    /// @notice One-shot guard for {recordMintScores}. A token can be
    ///         scored exactly once; subsequent attempts revert with
    ///         {AlreadyScored}.
    mapping(uint256 => bool) private _scored;

    /// @notice Emitted once per audited persona-decryption event. The
    ///         off-chain runner calls {logAccess} after pulling a fighter's
    ///         encrypted weights for an inference round, providing a public
    ///         audit trail of every battle the persona participated in. The
    ///         {battleId} is the BattleEscrow id (or 0 for off-battle
    ///         training accesses).
    event PersonaAccessed(
        uint256 indexed tokenId,
        address indexed accessor,
        uint256 indexed battleId,
        uint64 timestamp
    );

    /// @notice Emitted when {recordMintScores} commits the 5-trait vector
    ///         for a freshly-minted fighter. One-shot per tokenId.
    event FighterScored(
        uint256 indexed tokenId,
        address indexed scorer,
        Archetype archetype,
        uint8[5] scores
    );

    /// @notice Emitted on every successful mint that paid a non-zero
    ///         {mintFee}. Makes the per-mint economic flow auditable
    ///         independently of tx value parsing — analytics dashboards
    ///         can count mints + sum fees from this event alone.
    event MintFeePaid(
        address indexed minter,
        uint256 fee,
        uint256 indexed tokenId
    );

    error InvalidProof();
    error MintNotSupported();
    error SeedMismatch();
    error AlreadyScored();
    error InvalidScoreRange();
    error ProofExpired();
    error ProofAlreadyConsumed();
    error ExecutorCapReached();
    error ZeroAddress();
    error NotAuthorized();
    error IncorrectFee();

    constructor(
        address admin,
        address verifier_,
        address treasury_,
        uint256 mintFee_
    ) ERC721("Yap Fighter", "YAPF") {
        if (admin == address(0) || verifier_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        verifier = verifier_;
        treasury = treasury_;
        mintFee = mintFee_;
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

    /// @dev Disabled — use the 6-argument {mint} overload that commits an
    ///      archetype + seedHash. Kept payable to satisfy the IERC7857
    ///      surface; reverts unconditionally so callers see a typed error
    ///      instead of a silent ABI mismatch.
    function mint(
        address,
        string memory,
        bytes32,
        bytes memory
    )
        external
        payable
        override
        returns (uint256)
    {
        revert MintNotSupported();
    }

    /// @notice Mint a fighter INFT with persona commitments. The caller
    ///         declares their archetype (locked from this point forward)
    ///         and a hash of the off-chain JSONL persona seed. {recordMintScores}
    ///         later proves a TEE-judged score against that same seedHash,
    ///         blocking swap attacks where someone scores fighter A's seed
    ///         and writes it onto fighter B.
    /// @param to               recipient
    /// @param encryptedURI_    0G Storage URI for the encrypted persona
    /// @param metadataHash_    keccak commitment to the off-chain metadata
    /// @param sealedKey        sealed symmetric key for `to`
    /// @param archetype        Roaster/Debater/Philosopher/Troll/Scholar/Provocateur
    /// @param seedHash         keccak256 of the off-chain JSONL persona
    function mint(
        address to,
        string memory encryptedURI_,
        bytes32 metadataHash_,
        bytes memory sealedKey,
        Archetype archetype,
        bytes32 seedHash
    )
        external
        payable
        nonReentrant
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value != mintFee) revert IncorrectFee();
        if (seedHash == bytes32(0)) revert InvalidProof();
        if (mintFee > 0) {
            Address.sendValue(payable(treasury), mintFee);
        }

        tokenId = ++_nextId;
        _safeMint(to, tokenId);
        metadataHash[tokenId] = metadataHash_;
        encryptedURI[tokenId] = encryptedURI_;
        sealedKeys[tokenId] = sealedKey;
        _archetypeOf[tokenId] = archetype;
        _seedHashOf[tokenId] = seedHash;

        emit Minted(tokenId, to, metadataHash_, encryptedURI_);
        emit PublishedSealedKey(tokenId, to, sealedKey);
        if (mintFee > 0) {
            emit MintFeePaid(msg.sender, mintFee, tokenId);
        }
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
        // Brief: self-custodial INFT. Only the token owner can transfer with
        // re-encryption — no operator superuser path. Marketplaces/rental
        // escrows use the standard ERC-721 transfer flow which goes through
        // the _update hook (clears authorizations) without triggering
        // re-encryption (those are off-chain custody flows, not transfers
        // of ownership intent).
        if (msg.sender != from) revert NotAuthorized();
        if (proofs.length == 0) revert InvalidProof();

        OwnershipProof calldata op = proofs[proofs.length - 1].ownershipProof;
        _requireFreshProof(op, tokenId, to);
        if (op.dataHash == bytes32(0)) revert InvalidProof();
        _consumeProof(op, tokenId, to);

        _clearAuthorizations(tokenId);

        metadataHash[tokenId] = op.dataHash;
        // Sealing guarantee: rotate encryptedURI to the new ciphertext
        // location. Without this, the prior owner's blob remains the
        // canonical pointer and any party who downloaded it (the prior
        // owner) can still decrypt the persona post-transfer.
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
        // Self-custodial: only token owner can clone — no operator superuser.
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

    /// @notice Marks an ownership proof as fresh for a specific (tokenId,
    ///         recipient) pair. Callable by verifier. Per-token+recipient
    ///         binding prevents proof reuse across tokens or recipients —
    ///         a buggy verifier issuing the same proofId twice cannot
    ///         transfer two different tokens with one proof.
    /// @dev Timestamp used by {iTransferFrom}/{iCloneFrom} to enforce PROOF_VALIDITY.
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

    /// @dev Inner hash binds `block.chainid` so a proof attested on one
    ///      chain cannot replay on another (defends a hypothetical
    ///      testnet→mainnet TEE-key reuse during a migration window).
    ///      Off-chain verifiers must mirror the same binding when they
    ///      compute the proofId for {attestProof}.
    function _boundProofId(
        OwnershipProof calldata op,
        uint256 tokenId,
        address recipient
    ) internal view returns (bytes32) {
        bytes32 id = keccak256(
            abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof, block.chainid)
        );
        return keccak256(abi.encode(id, tokenId, recipient));
    }

    function isExecutor(uint256 tokenId, address executor) external view returns (bool) {
        return _executorIndex[tokenId][executor] != 0;
    }

    function executorCount(uint256 tokenId) external view returns (uint256) {
        return _executors[tokenId].length;
    }

    function executorsOf(uint256 tokenId) external view returns (address[] memory) {
        return _executors[tokenId];
    }

    // --------------------------------------------------------------------------------------------
    // Persona audit log
    // --------------------------------------------------------------------------------------------

    /// @notice Record a persona-access event. Gated to the token owner OR an
    ///         authorized executor so a third party cannot pollute the audit
    ///         trail. The runner (typically an executor authorized for a
    ///         rental window) calls this once per round on its way through
    ///         the inference path; the contract emits a PersonaAccessed log
    ///         the indexer can fan out into transparency UIs.
    /// @param tokenId  The fighter being decrypted.
    /// @param battleId BattleEscrow id this access belongs to (0 for
    ///                 non-battle training/test accesses).
    function logAccess(uint256 tokenId, uint256 battleId) external {
        bool isOwner_ = ownerOf(tokenId) == msg.sender;
        bool isExecutor_ = _executorIndex[tokenId][msg.sender] != 0;
        bool isRunner_ = hasRole(RUNNER_ROLE, msg.sender);
        if (!isOwner_ && !isExecutor_ && !isRunner_) revert NotAuthorized();
        unchecked {
            _accessCount[tokenId] += 1;
        }
        emit PersonaAccessed(tokenId, msg.sender, battleId, uint64(block.timestamp));
    }

    function getAccessCount(uint256 tokenId) external view returns (uint256) {
        return _accessCount[tokenId];
    }

    // --------------------------------------------------------------------------------------------
    // Persona scoring (TEE-attested)
    // --------------------------------------------------------------------------------------------

    /// @notice Commit a TEE-judged 5-trait score vector to a fighter. The
    ///         contract reconstructs the canonical text from on-chain
    ///         inputs (chainid, contract address, tokenId, seedHash, scores)
    ///         and verifies the TEE attestation envelope via
    ///         {TEEAttestationLib}. The {canonicalText} string the runner
    ///         instructs the LLM to echo MUST match the format below verbatim:
    ///
    ///           YAP_FIGHTER_SCORE|<chainid>|<lowercase-fighter-addr>|<tokenId>|<seedHashLowercaseHex>|<L>|<R>|<A>|<V>|<C>
    ///
    ///         One-shot per tokenId; subsequent calls revert with
    ///         {AlreadyScored}. Gated to the token owner or any
    ///         RUNNER_ROLE-bearing address.
    /// @param tokenId        Target fighter.
    /// @param scores         [Logos, Rhetoric, Aggression, Range, Concreteness],
    ///                       each value in [{MIN_TRAIT_SCORE}, {MAX_TRAIT_SCORE}].
    /// @param seedHash       Must match `_seedHashOf[tokenId]` set at mint.
    /// @param responseBody   Raw TEE response body the broker hashed.
    /// @param contentOffset  Byte offset where the canonical text begins in
    ///                       responseBody (between JSON-quote chars).
    /// @param signedText     Broker routing-proof signedText
    ///                       `<reqSha>:<respSha>:<providerType>:<providerIdentity>:<tlsSha>`.
    /// @param teeSignature   65-byte ECDSA personal_sign by the live
    ///                       0G Compute provider's teeSignerAddress
    ///                       (must match `oracleKey()` set on this contract).
    function recordMintScores(
        uint256 tokenId,
        uint8[5] calldata scores,
        bytes32 seedHash,
        bytes calldata responseBody,
        uint256 contentOffset,
        bytes calldata signedText,
        bytes calldata teeSignature
    ) external {
        // Auth: owner or RUNNER_ROLE bearer.
        bool isOwner_ = _ownerOf(tokenId) == msg.sender;
        bool isRunner_ = hasRole(RUNNER_ROLE, msg.sender);
        if (!isOwner_ && !isRunner_) revert NotAuthorized();

        // One-shot + seed binding.
        if (_scored[tokenId]) revert AlreadyScored();
        if (_seedHashOf[tokenId] != seedHash) revert SeedMismatch();

        // Range gate — TEE judge is anchored 1-5; reject anything else.
        for (uint256 i = 0; i < 5; ++i) {
            uint8 s = scores[i];
            if (s < MIN_TRAIT_SCORE || s > MAX_TRAIT_SCORE) revert InvalidScoreRange();
        }

        // Reconstruct the canonical the TEE was instructed to echo, then
        // verify it appears verbatim at the claimed offset inside the
        // signed responseBody.
        bytes memory canonical = _scoreCanonicalText(tokenId, seedHash, scores);
        if (oracleKey() == address(0)) revert NotAuthorized();
        TEEAttestationLib.verifyAttestation(
            canonical,
            responseBody,
            contentOffset,
            signedText,
            teeSignature,
            oracleKey()
        );

        _traitsOf[tokenId] = _packTraits(scores);
        _scored[tokenId] = true;
        emit FighterScored(tokenId, msg.sender, _archetypeOf[tokenId], scores);
    }

    /// @notice Return the recorded 5-trait vector for a fighter.
    ///         All-zero if the fighter hasn't been scored yet.
    function getTraits(uint256 tokenId) external view returns (uint8[5] memory out) {
        bytes5 packed = _traitsOf[tokenId];
        out[0] = uint8(packed[0]);
        out[1] = uint8(packed[1]);
        out[2] = uint8(packed[2]);
        out[3] = uint8(packed[3]);
        out[4] = uint8(packed[4]);
    }

    function getArchetype(uint256 tokenId) external view returns (Archetype) {
        return _archetypeOf[tokenId];
    }

    function getSeedHash(uint256 tokenId) external view returns (bytes32) {
        return _seedHashOf[tokenId];
    }

    function isScored(uint256 tokenId) external view returns (bool) {
        return _scored[tokenId];
    }

    /// @notice Oracle key whose TEE attestation {recordMintScores} accepts.
    ///         Stored separately from the BattleEscrow oracle key — admin
    ///         may rotate independently as the score-judging provider's
    ///         teeSignerAddress changes (e.g. provider rotation, key
    ///         ceremony). Default: address(0) → blocks scoring until set.
    address public scoreOracleKey;

    /// @notice Rotate the score-judging oracle key. Emits an audit event so
    ///         off-chain watchers can detect key ceremonies.
    function setScoreOracleKey(address newKey) external onlyRole(ADMIN_ROLE) {
        if (newKey == address(0)) revert ZeroAddress();
        address prev = scoreOracleKey;
        scoreOracleKey = newKey;
        emit ScoreOracleKeyUpdated(prev, newKey);
    }

    event ScoreOracleKeyUpdated(address indexed previousKey, address indexed newKey);

    /// @dev Reads the current score-judging oracle key. Wrapped in a
    ///      function so {recordMintScores} can resolve it lazily and tests
    ///      can override if needed.
    function oracleKey() public view returns (address) {
        return scoreOracleKey;
    }

    /// @dev Returns the canonical text the TEE is instructed to echo for
    ///      a {recordMintScores} attestation. Format:
    ///        YAP_FIGHTER_SCORE|<chainid>|<lowercase-fighter-addr>|<tokenId>|<seedHashHex>|<L>|<R>|<A>|<V>|<C>
    ///      Lowercase hex matches OpenZeppelin Strings.toHexString output.
    function _scoreCanonicalText(
        uint256 tokenId,
        bytes32 seedHash,
        uint8[5] calldata scores
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            "YAP_FIGHTER_SCORE|",
            Strings.toString(block.chainid),
            "|",
            Strings.toHexString(uint160(address(this)), 20),
            "|",
            Strings.toString(tokenId),
            "|",
            Strings.toHexString(uint256(seedHash), 32),
            "|",
            Strings.toString(uint256(scores[0])),
            "|",
            Strings.toString(uint256(scores[1])),
            "|",
            Strings.toString(uint256(scores[2])),
            "|",
            Strings.toString(uint256(scores[3])),
            "|",
            Strings.toString(uint256(scores[4]))
        );
    }

    /// @dev View helper — returns the raw canonical bytes for off-chain
    ///      clients building the LLM prompt + reproducing the digest.
    function scoreCanonicalText(
        uint256 tokenId,
        bytes32 seedHash,
        uint8[5] calldata scores
    ) external view returns (string memory) {
        return string(_scoreCanonicalText(tokenId, seedHash, scores));
    }

    function _packTraits(uint8[5] calldata scores) internal pure returns (bytes5) {
        return bytes5(
            abi.encodePacked(scores[0], scores[1], scores[2], scores[3], scores[4])
        );
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

    // OZ v5: _update is the single hook for mint/burn/transfer. We use it to purge authorizations
    // on any non-mint, non-burn transfer that bypasses iTransferFrom (e.g., a direct ERC-721
    // `transferFrom` by an approved operator).
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
            super.supportsInterface(interfaceId);
    }
}
