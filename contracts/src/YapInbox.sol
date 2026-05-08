// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title YapInbox
/// @notice Singleton A2A message emitter for Yap fighter owners on 0G
///         Chain. Stateless: the contract owns nothing, stores nothing.
///         Every message is a chain event — recipients scan logs filtered
///         by `to`, ECIES-decrypt the inline payload, or fetch the 0G
///         Storage blob via `dataHash` if the body spilled over.
///
/// @dev Use cases:
///        - Fighter owners coordinating before / after a battle
///          (challenge proposal, post-battle trash talk, training tip
///          exchange)
///        - Off-chain rental negotiation with on-chain provenance
///          (encrypted terms, accept signal, cancel signal)
///        - Dispute correspondence layered on top of `proposeRentalSplit`
///
///      Identity: `msg.sender` is the chain-authenticated `from`. Listeners
///      MUST trust `event.from` over any inline plaintext claim.
///      Confidentiality comes from ECIES at the application layer;
///      authentication comes from msg.sender at the protocol layer.
///
///      Replay: EVM nonces block literal tx replay. Semantic replay
///      (a different sender re-broadcasting the same ciphertext) is
///      not impersonation — the new sender is attributed correctly in
///      `event.from`.
///
///      Adapted from s0nderlabs/anima — AnimaInbox.sol.
contract YapInbox {
    /// @notice Hard cap on inline payload bytes. Yap's spillover
    ///         threshold is 3 KiB at the application layer; this 16 KiB
    ///         ceiling gives 5x headroom while forcing megabyte-scale
    ///         abuse through 0G Storage (which carries its own fee).
    uint256 public constant MAX_INLINE_PAYLOAD = 16 * 1024;

    /// @notice Emitted on every successful sendMessage call.
    /// @param from      Chain-authenticated sender (msg.sender).
    /// @param to        Recipient address. Listeners filter on this topic.
    /// @param payload   Inline ECIES ciphertext, or empty.
    /// @param dataHash  0G Storage pointer (when payload spilled over) or zero.
    event Message(
        address indexed from,
        address indexed to,
        bytes payload,
        bytes32 dataHash
    );

    error InvalidRecipient();
    error EmptyMessage();
    error PayloadTooLarge();

    /// @notice Send a message. Emits exactly one event, stores nothing.
    ///         At least one of `payload` and `dataHash` must be non-empty.
    /// @param to        Recipient address; cannot be address(0).
    /// @param payload   Inline ECIES ciphertext (≤ MAX_INLINE_PAYLOAD), or
    ///                  empty if dataHash is set.
    /// @param dataHash  0G Storage hash, or bytes32(0) when payload is inline.
    function sendMessage(
        address to,
        bytes calldata payload,
        bytes32 dataHash
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (payload.length == 0 && dataHash == bytes32(0)) {
            revert EmptyMessage();
        }
        if (payload.length > MAX_INLINE_PAYLOAD) revert PayloadTooLarge();
        emit Message(msg.sender, to, payload, dataHash);
    }
}
