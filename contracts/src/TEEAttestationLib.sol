// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title TEEAttestationLib — reusable 0G Compute routing-proof verification.
/// @notice Extracted from BattleEscrow.submitVerdict so other Yap contracts
///         (YapFighter.recordMintScores, future scoring/judging surfaces)
///         can verify the same TEE-provider attestation envelope without
///         duplicating the recovery + sha256 + canonical-offset checks.
///
///         The provider's enclave personal-signs the routing-proof text
///           `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>`
///         using its TEE-derived ECDSA key (registered as `oracleKey`).
///         To bind that attestation to a specific application-level
///         canonical (a verdict line, a score line, etc), callers pass:
///
///           - `canonical`     the application-specific bytes that must
///                             appear inside the JSON response
///           - `responseBody`  full HTTP response body the broker hashed
///           - `contentOffset` byte index where `canonical` begins in
///                             `responseBody`; pre/post bytes must be
///                             ASCII double-quote chars
///           - `signedText`    the routing-proof string the broker formatted
///           - `teeSignature`  65-byte ECDSA personal_sign signature
///           - `oracleKey`     expected teeSignerAddress
///
///         {verifyAttestation} reverts with a typed error on any check
///         failure; returns void on success.
library TEEAttestationLib {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice Recovered signer of {signedText} did not match the expected
    ///         {oracleKey}. Either the provider's TEE key rotated and the
    ///         caller's oracleKey is stale, or the signature is malicious.
    error InvalidOracleSignature();

    /// @notice {signedText} doesn't match the
    ///         `<64 hex>:<64 hex>:...`  shape the broker emits — too short,
    ///         missing colon delimiters at the expected offsets, or
    ///         non-hex characters in the sha256 field.
    error InvalidSignedTextFormat();

    /// @notice sha256 of the submitted {responseBody} doesn't match the
    ///         hash the broker bound into {signedText}. The TEE response
    ///         was tampered post-signing, OR the wrong response was paired
    ///         with the routing-proof.
    error ResponseHashMismatch();

    /// @notice The expected {canonical} bytes were not found at
    ///         responseBody[contentOffset..contentOffset+canonical.length].
    ///         The LLM's response did not include the application's
    ///         canonical commitment verbatim.
    error CanonicalContentMissing();

    /// @notice {contentOffset} points at a position whose neighbouring
    ///         bytes aren't both ASCII double-quote (i.e. the offset is
    ///         not inside a JSON string value). This blocks an attacker
    ///         from pointing at a substring that happens to match
    ///         {canonical} but lives in a different JSON field.
    error InvalidContentOffset();

    /// @notice Verify a TEE routing-proof attestation envelope.
    /// @dev   Reverts on any check failure. Caller is expected to use
    ///        try/catch only when degrading gracefully — production
    ///        callers should let the revert bubble up.
    function verifyAttestation(
        bytes memory canonical,
        bytes calldata responseBody,
        uint256 contentOffset,
        bytes calldata signedText,
        bytes calldata teeSignature,
        address oracleKey
    ) internal pure {
        // 1. ECDSA recovery on EIP-191 of signedText → oracleKey.
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        if (digest.recover(teeSignature) != oracleKey) {
            revert InvalidOracleSignature();
        }

        // 2. Parse the 2nd field of signedText (response sha256) and verify
        //    sha256(responseBody) matches. Format expectation:
        //      [0..63]   reqSha (64 hex)
        //      [64]      ':'
        //      [65..128] respSha (64 hex)
        //      [129]     ':'
        //      [130..]   providerType ':' providerIdentity ':' tlsCertSha
        if (signedText.length < 130) revert InvalidSignedTextFormat();
        if (signedText[64] != bytes1(":") || signedText[129] != bytes1(":")) {
            revert InvalidSignedTextFormat();
        }
        bytes32 expectedRespSha = _hex64ToBytes32(signedText, 65);
        if (sha256(responseBody) != expectedRespSha) {
            revert ResponseHashMismatch();
        }

        // 3. Confirm {canonical} lives at responseBody[contentOffset:],
        //    with quote chars at offset-1 and offset+canonical.length.
        _verifyCanonicalAtOffset(responseBody, contentOffset, canonical);
    }

    /// @notice Returns the EIP-191 personal_sign digest the contract verifies.
    ///         Useful for off-chain clients reproducing the digest locally.
    function signedTextDigest(bytes calldata signedText)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toEthSignedMessageHash(signedText);
    }

    /// @dev Converts 64 ASCII hex characters at `data[offset..offset+64]`
    ///      into a bytes32. Reverts on out-of-bounds or invalid hex.
    function _hex64ToBytes32(bytes calldata data, uint256 offset)
        private
        pure
        returns (bytes32)
    {
        if (offset + 64 > data.length) revert InvalidSignedTextFormat();
        uint256 v = 0;
        unchecked {
            for (uint256 i = 0; i < 64; ++i) {
                uint8 c = uint8(data[offset + i]);
                uint8 nibble;
                if (c >= 0x30 && c <= 0x39) {
                    nibble = c - 0x30;
                } else if (c >= 0x61 && c <= 0x66) {
                    nibble = c - 0x61 + 10;
                } else if (c >= 0x41 && c <= 0x46) {
                    nibble = c - 0x41 + 10;
                } else {
                    revert InvalidSignedTextFormat();
                }
                v = (v << 4) | nibble;
            }
        }
        return bytes32(v);
    }

    /// @dev Verifies that {canonical} bytes appear at
    ///      responseBody[offset:offset+canonical.length] AND the byte
    ///      immediately before {offset} and immediately after the canonical
    ///      run are both ASCII double-quote chars. The quote requirement
    ///      blocks pointing at an unrelated substring inside the JSON
    ///      envelope (e.g. spanning two field boundaries).
    function _verifyCanonicalAtOffset(
        bytes calldata responseBody,
        uint256 offset,
        bytes memory canonical
    ) private pure {
        uint256 len = canonical.length;
        if (offset == 0 || offset + len + 1 > responseBody.length) {
            revert InvalidContentOffset();
        }
        if (
            responseBody[offset - 1] != bytes1('"') ||
            responseBody[offset + len] != bytes1('"')
        ) {
            revert InvalidContentOffset();
        }
        for (uint256 i = 0; i < len; ++i) {
            if (responseBody[offset + i] != canonical[i]) {
                revert CanonicalContentMissing();
            }
        }
    }
}
