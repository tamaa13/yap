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
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant PROOF_VALIDITY = 1 hours;
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

    error InvalidProof();
    error ProofExpired();
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
        _grantRole(MINTER_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
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
        TransferValidityProof[] calldata proofs
    ) external override nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (ownerOf(tokenId) != from) revert NotAuthorized();
        if (msg.sender != from && !hasRole(OPERATOR_ROLE, msg.sender)) revert NotAuthorized();
        if (proofs.length == 0) revert InvalidProof();

        OwnershipProof calldata op = proofs[proofs.length - 1].ownershipProof;
        _requireFreshProof(op);
        if (op.dataHash == bytes32(0)) revert InvalidProof();

        _clearAuthorizations(tokenId);

        metadataHash[tokenId] = op.dataHash;
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
        if (msg.sender != owner && !hasRole(OPERATOR_ROLE, msg.sender)) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();

        _requireFreshProof(proof.ownershipProof);
        if (proof.ownershipProof.dataHash == bytes32(0)) revert InvalidProof();

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

    /// @notice Marks an ownership proof as fresh (issued now). Callable by verifier.
    /// @dev Timestamp used by {iTransferFrom}/{iCloneFrom} to enforce PROOF_VALIDITY.
    function attestProof(bytes32 proofId) external {
        if (msg.sender != verifier) revert NotAuthorized();
        _proofIssuedAt[proofId] = block.timestamp;
    }

    function _requireFreshProof(OwnershipProof calldata op) internal view {
        bytes32 id = keccak256(abi.encode(op.oracleType, op.dataHash, op.nonce, op.proof));
        uint256 issued = _proofIssuedAt[id];
        if (issued == 0) revert InvalidProof();
        if (block.timestamp > issued + PROOF_VALIDITY) revert ProofExpired();
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
