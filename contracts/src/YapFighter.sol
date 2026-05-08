// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {IERC7857} from "./IERC7857.sol";

/// @title YapFighter — ERC-7857 Intelligent NFT for Yap AI combat arena.
/// @notice Each token represents an AI fighter whose encrypted weights live off-chain.
///         Ownership transfers require a re-sealing proof (TEE/ZK) verified by {verifier}.
contract YapFighter is ERC721, AccessControl, ReentrancyGuard, IERC7857 {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Ownership proofs expire after this window. Tightened from 1
    ///         hour to 10 minutes to reduce replay surface for stale proofs
    ///         (industry standard for short-lived ownership attestations).
    uint256 public constant PROOF_VALIDITY = 10 minutes;
    uint256 public constant MAX_EXECUTORS = 100;

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
    ///         mint N clones from one attestation. (Anima pattern,
    ///         AnimaAgentNFT.sol.)
    mapping(bytes32 => bool) private _proofConsumed;

    error InvalidProof();
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

    /// @dev Public mint: anyone can mint an INFT by paying `mintFee`. The caller
    ///      supplies `encryptedURI_` + `metadataHash_` (typically prepared
    ///      off-chain by a backend that uploads to 0G Storage + computes
    ///      keccak(metadata)) and the `to` recipient (usually msg.sender).
    ///      No access-control gate — fee acts as spam protection.
    function mint(
        address to,
        string memory encryptedURI_,
        bytes32 metadataHash_,
        bytes memory sealedKey
    )
        external
        payable
        override
        nonReentrant
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value != mintFee) revert IncorrectFee();
        if (mintFee > 0) {
            Address.sendValue(payable(treasury), mintFee);
        }

        tokenId = ++_nextId;
        _safeMint(to, tokenId);
        metadataHash[tokenId] = metadataHash_;
        encryptedURI[tokenId] = encryptedURI_;
        sealedKeys[tokenId] = sealedKey;

        emit Minted(tokenId, to, metadataHash_, encryptedURI_);
        emit PublishedSealedKey(tokenId, to, sealedKey);
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

    function _boundProofId(
        OwnershipProof calldata op,
        uint256 tokenId,
        address recipient
    ) internal pure returns (bytes32) {
        bytes32 id = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
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
