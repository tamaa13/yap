// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ERC-7857 — Intelligent NFT (INFT) interface
/// @notice Tokenized AI agents whose encrypted weights live off-chain (0G Storage / IPFS) and whose
///         ownership transfer requires a re-sealing proof attested by an oracle (TEE / ZK).
interface IERC7857 {
    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    struct AccessProof {
        address subscriber;
        bytes32 tokenIntent;
        bytes signature;
    }

    struct OwnershipProof {
        uint8 oracleType; // 0 = TEE, 1 = ZK
        bytes32 dataHash;
        bytes sealedKey;
        bytes targetPubkey;
        bytes nonce;
        bytes proof;
    }

    struct TransferValidityProof {
        AccessProof accessProof;
        OwnershipProof ownershipProof;
    }

    event Minted(
        uint256 indexed tokenId,
        address indexed to,
        bytes32 metadataHash,
        string encryptedURI
    );
    event Transferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bytes32 newMetadataHash
    );
    event Cloned(
        uint256 indexed parentTokenId,
        uint256 indexed newTokenId,
        address indexed to,
        bytes32 metadataHash
    );
    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        bytes permissions
    );
    event UsageRevoked(uint256 indexed tokenId, address indexed executor);
    event PublishedSealedKey(
        uint256 indexed tokenId,
        address indexed recipient,
        bytes sealedKey
    );

    function mint(
        address to,
        string memory encryptedURI,
        bytes32 metadataHash,
        bytes memory sealedKey
    ) external payable returns (uint256);

    function iTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) external;

    function iCloneFrom(
        address to,
        uint256 tokenId,
        TransferValidityProof calldata proof
    ) external returns (uint256);

    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external;

    function revokeAuthorization(uint256 tokenId, address executor) external;

    function verifier() external view returns (address);
}
