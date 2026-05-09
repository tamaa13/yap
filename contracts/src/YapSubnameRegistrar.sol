// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";

interface IFighter {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title YapSubnameRegistrar — permissionless `<label>.yap.0g` registrar.
/// @notice Phase 1: standalone label↔tokenId registry. The `yap.0g`
///         parent domain is NOT registered with SPACE ID at deploy time
///         — there is no on-chain SidRegistry write here. Resolvers
///         consume the canonical view pair `tokenIdOf` / `labelOf`.
/// @dev    Phase 2 will integrate with SPACE ID's SANN SidRegistry once
///         `yap.0g` is registered (the parent must `setApprovalForAll`
///         on a SANN-aware sibling contract). The on-chain shape stays
///         the same — tokenId binding rather than address binding —
///         and lazy resolution via `fighter.ownerOf` keeps the registry
///         consistent through fighter transfers without callbacks.
///         Listeners that need ownership-change events should subscribe
///         to `IERC721.Transfer` on YapFighter.
///
///         Permissionless ENS-style registrar — bound to (label →
///         tokenId) instead of (label → address) so the canonical
///         pointer follows the NFT instead of a static wallet.
contract YapSubnameRegistrar is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint8 public constant MIN_LABEL_LENGTH = 3;
    uint8 public constant MAX_LABEL_LENGTH = 32;

    IFighter public immutable fighterContract;
    address public treasury;
    uint256 public registerFee;

    /// @dev `0` = unregistered. Safe sentinel because YapFighter starts
    ///      ids at 1 (`++_nextId`) — tokenId 0 is never issued.
    mapping(bytes32 => uint256) private _labelHashToToken;
    mapping(uint256 => string) private _tokenToLabel;

    event SubnameRegistered(
        uint256 indexed tokenId,
        bytes32 indexed labelHash,
        address indexed registrant,
        string label
    );
    event SubnameReleased(
        uint256 indexed tokenId,
        bytes32 indexed labelHash,
        address indexed releaser,
        string label
    );
    event RegisterFeeUpdated(uint256 previousFee, uint256 newFee);
    event TreasuryUpdated(address indexed previous, address indexed next);

    error ZeroAddress();
    error LabelTooShort();
    error LabelTooLong();
    error LabelInvalidChar();
    error LabelHasLeadingHyphen();
    error LabelHasTrailingHyphen();
    error LabelAlreadyTaken();
    error TokenAlreadyHasLabel();
    error NotFighterOwner();
    error IncorrectFee();
    error NoLabel();

    constructor(address fighter_, address admin, address treasury_) {
        if (fighter_ == address(0) || admin == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        fighterContract = IFighter(fighter_);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // --------------------------------------------------------------------------------------------
    // Admin
    // --------------------------------------------------------------------------------------------

    function setRegisterFee(uint256 fee) external onlyRole(ADMIN_ROLE) {
        uint256 prev = registerFee;
        registerFee = fee;
        emit RegisterFeeUpdated(prev, fee);
    }

    function setTreasury(address treasury_) external onlyRole(ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        address prev = treasury;
        treasury = treasury_;
        emit TreasuryUpdated(prev, treasury_);
    }

    // --------------------------------------------------------------------------------------------
    // Register / release
    // --------------------------------------------------------------------------------------------

    /// @notice Bind `label` to `tokenId`. Reverts if the caller is not the
    ///         current fighter owner, the label is malformed/taken, or the
    ///         token already has a label. To rename, call {release} first.
    function register(string calldata label, uint256 tokenId) external payable {
        if (msg.value != registerFee) revert IncorrectFee();
        if (fighterContract.ownerOf(tokenId) != msg.sender) revert NotFighterOwner();
        if (bytes(_tokenToLabel[tokenId]).length != 0) revert TokenAlreadyHasLabel();

        bytes32 labelHash = _validateAndHash(label);
        if (_labelHashToToken[labelHash] != 0) revert LabelAlreadyTaken();

        _labelHashToToken[labelHash] = tokenId;
        _tokenToLabel[tokenId] = label;

        if (registerFee > 0) Address.sendValue(payable(treasury), registerFee);
        emit SubnameRegistered(tokenId, labelHash, msg.sender, label);
    }

    /// @notice Release the label currently bound to `tokenId`. Caller must
    ///         be the current fighter owner. Frees both forward + reverse
    ///         maps so the label and the tokenId can be re-registered.
    function release(uint256 tokenId) external {
        if (fighterContract.ownerOf(tokenId) != msg.sender) revert NotFighterOwner();
        string memory currentLabel = _tokenToLabel[tokenId];
        if (bytes(currentLabel).length == 0) revert NoLabel();
        bytes32 labelHash = keccak256(bytes(currentLabel));

        delete _labelHashToToken[labelHash];
        delete _tokenToLabel[tokenId];
        emit SubnameReleased(tokenId, labelHash, msg.sender, currentLabel);
    }

    // --------------------------------------------------------------------------------------------
    // Resolution
    // --------------------------------------------------------------------------------------------

    /// @notice Forward resolution: `label` → `tokenId`. Returns `0` when
    ///         the label is unregistered.
    function tokenIdOf(string calldata label) external view returns (uint256) {
        return _labelHashToToken[keccak256(bytes(label))];
    }

    /// @notice Reverse resolution: `tokenId` → `label`. Returns the empty
    ///         string when the token has no label.
    function labelOf(uint256 tokenId) external view returns (string memory) {
        return _tokenToLabel[tokenId];
    }

    /// @notice Resolves `label` all the way through to the current fighter
    ///         owner. Mirrors what a SANN resolver would do — but without
    ///         touching SidRegistry. Returns `address(0)` if the label is
    ///         unregistered or the underlying fighter has been burned.
    function effectiveOwner(string calldata label) external view returns (address) {
        uint256 tokenId = _labelHashToToken[keccak256(bytes(label))];
        if (tokenId == 0) return address(0);
        try fighterContract.ownerOf(tokenId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    /// @notice Returns true iff `label` is well-formed AND not yet taken.
    ///         Total — never reverts. Useful for UI pre-flight checks.
    function isAvailable(string calldata label) external view returns (bool) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len < MIN_LABEL_LENGTH || len > MAX_LABEL_LENGTH) return false;
        if (b[0] == 0x2d || b[len - 1] == 0x2d) return false;
        for (uint256 i = 0; i < len; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || (c == 0x2d);
            if (!ok) return false;
        }
        return _labelHashToToken[keccak256(b)] == 0;
    }

    /// @notice Bulk reverse resolution. Lets a UI pull labels for an
    ///         entire fighter list in one call instead of N round-trips.
    ///         Empty string at index `i` means tokenIds[i] is unlabeled.
    function resolveBatch(uint256[] calldata tokenIds)
        external
        view
        returns (string[] memory labels)
    {
        uint256 n = tokenIds.length;
        labels = new string[](n);
        for (uint256 i = 0; i < n; ++i) {
            labels[i] = _tokenToLabel[tokenIds[i]];
        }
    }

    /// @notice Bulk forward resolution. Returns `0` at index `i` if
    ///         labels[i] is unregistered.
    function resolveLabelsBatch(string[] calldata labels)
        external
        view
        returns (uint256[] memory tokenIds)
    {
        uint256 n = labels.length;
        tokenIds = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            tokenIds[i] = _labelHashToToken[keccak256(bytes(labels[i]))];
        }
    }

    // --------------------------------------------------------------------------------------------
    // Internals
    // --------------------------------------------------------------------------------------------

    function _validateAndHash(string calldata label) internal pure returns (bytes32) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len < MIN_LABEL_LENGTH) revert LabelTooShort();
        if (len > MAX_LABEL_LENGTH) revert LabelTooLong();
        if (b[0] == 0x2d) revert LabelHasLeadingHyphen();
        if (b[len - 1] == 0x2d) revert LabelHasTrailingHyphen();
        for (uint256 i = 0; i < len; ++i) {
            bytes1 c = b[i];
            bool ok =
                (c >= 0x61 && c <= 0x7a) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c == 0x2d);                // -
            if (!ok) revert LabelInvalidChar();
        }
        return keccak256(b);
    }
}
