// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFighterOwner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title FighterTrainer
/// @notice Records continuous-learning training sessions for YapFighter
///         INFTs. Each `train()` call attaches a fresh TEE-attested
///         fine-tune to a fighter's on-chain history without mutating
///         the original mint metadata.
///
/// @dev We deliberately keep this contract additive — YapFighter remains
///      ERC-7857 with its original `encryptedURI` from mint. The "current"
///      weights for inference is the most recent FighterTrained event for
///      that tokenId. Yap's frontend reads logs to render a verifiable
///      evolution timeline; off-chain indexers (subgraph, etc.) can mirror
///      the same data.
///
///      This decoupling means:
///        - YapFighter stays untouched (no contract upgrade risk)
///        - Training history is globally observable, replayable, auditable
///        - A fighter can be trained N times; each session is its own
///          `FighterTrained(tokenId, sessionNumber, ...)` event
contract FighterTrainer {
    IFighterOwner public immutable yapFighter;

    /// @notice Number of training sessions completed per tokenId.
    /// @dev    sessionNumber emitted in FighterTrained == this counter
    ///         right after the increment for that token.
    mapping(uint256 => uint256) public trainingCount;

    /// @notice Latest encryptedURI for a fighter (most recent training,
    ///         or the original mint if untrained). Used as a cheap pointer
    ///         for clients that don't want to scan logs.
    mapping(uint256 => string) public latestEncryptedURI;

    /// @notice Latest fine-tune task id (UUID string from 0G Compute) per
    ///         tokenId — handy for verifying on the explorer.
    mapping(uint256 => string) public latestTaskId;

    event FighterTrained(
        uint256 indexed tokenId,
        address indexed trainer,
        uint256 indexed sessionNumber,
        string encryptedURI,
        bytes32 metadataHash,
        bytes sealedKey,
        string fineTuneTaskId,
        string fineTuneProvider,
        bytes attestationSig,
        uint256 timestamp
    );

    error NotFighterOwner();
    error EmptyEncryptedURI();
    error EmptyTaskId();

    constructor(address yapFighter_) {
        require(yapFighter_ != address(0), "yapFighter required");
        yapFighter = IFighterOwner(yapFighter_);
    }

    /// @notice Record a new training session for a fighter. Caller must be
    ///         the current INFT owner. The actual fine-tune happened off-
    ///         chain on a 0G TEE provider — this call is purely the
    ///         on-chain attestation that the new weights belong to this
    ///         tokenId.
    ///
    /// @dev    The same payload shape as YapFighter.mint — encryptedURI,
    ///         metadataHash, sealedKey — plus the 0G-specific provenance
    ///         (taskId, provider address, TEE attestation signature) that
    ///         lets verifiers re-derive trust in the new weights without
    ///         trusting Yap's backend.
    function train(
        uint256 tokenId,
        string calldata encryptedURI,
        bytes32 metadataHash,
        bytes calldata sealedKey,
        string calldata fineTuneTaskId,
        string calldata fineTuneProvider,
        bytes calldata attestationSig
    ) external {
        if (yapFighter.ownerOf(tokenId) != msg.sender) revert NotFighterOwner();
        if (bytes(encryptedURI).length == 0) revert EmptyEncryptedURI();
        if (bytes(fineTuneTaskId).length == 0) revert EmptyTaskId();

        uint256 session = ++trainingCount[tokenId];
        latestEncryptedURI[tokenId] = encryptedURI;
        latestTaskId[tokenId] = fineTuneTaskId;

        // Note: metadataHash / sealedKey are emitted in the event so a
        // verifier can rebuild the full mint-equivalent prepare payload
        // for any historical session, not just the current one.
        emit FighterTrained(
            tokenId,
            msg.sender,
            session,
            encryptedURI,
            metadataHash,
            sealedKey,
            fineTuneTaskId,
            fineTuneProvider,
            attestationSig,
            block.timestamp
        );
    }
}
