// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

interface IBattleRegistry {
    function registerBattle(
        uint256 battleId,
        uint256 fighterA,
        uint256 fighterB,
        string calldata topic
    ) external;

    function finalizeBattle(uint256 battleId, uint8 winner) external;
}

interface IFighter {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isExecutor(uint256 tokenId, address executor) external view returns (bool);
}

/// @title BattleEscrow — pool + pro-rata payout for Yap fighter battles.
/// @notice Anyone can create a battle between two fighters and pick a side.
///         A 0G Compute TEE provider judges the battle and signs the verdict
///         inside its enclave; after a dispute window, the pool is settled
///         and winners claim their share (pull pattern).
///
///         Verdict signing is performed by the 0G Compute TeeML provider
///         itself — no separate signer service. The provider's TEE-derived
///         ECDSA key (registered on-chain in the 0G ServingContract) signs
///         the canonical verdict text that the LLM produces, and this
///         contract verifies the signature recovers to {oracleKey}, which
///         admin sets equal to the provider's teeSignerAddress.
contract BattleEscrow is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Default dispute window. Admin can override per-deployment via
    ///         {setDisputeWindow} — 24h is the production-safe default; testnet
    ///         deployments typically lower it for demo purposes.
    uint256 public constant DEFAULT_DISPUTE_WINDOW = 24 hours;
    uint256 public constant MAX_DISPUTE_WINDOW = 7 days;
    uint256 public disputeWindow;

    /// @notice One-shot per-battle dispute window extension. Admin can call
    ///         {pauseSettlement} once per battle to extend the dispute window
    ///         by {DISPUTE_EXTENSION} additional seconds (effective until the
    ///         existing window expires + extension).
    uint256 public constant DISPUTE_EXTENSION = 24 hours;
    mapping(uint256 => bool) public disputeExtended;
    /// @dev Per-battle dispute deadline override. Set when {pauseSettlement}
    ///      runs; settlement compares against this if set, else the standard
    ///      verdictTime + disputeWindow.
    mapping(uint256 => uint64) public disputeDeadline;

    /// @notice Stuck-Verdict deadman switch. After this many seconds in
    ///         Verdict status with no settle() call, anyone can force a
    ///         refund-cancel via {refundStuckVerdict}.
    uint256 public constant STUCK_VERDICT_TIMEOUT = 30 days;

    /// @dev Deprecated alias of {disputeWindow}. Kept for off-chain tooling
    ///      that reads the constant by name. New integrations should read
    ///      {disputeWindow} instead.
    function DISPUTE_WINDOW() external view returns (uint256) {
        return disputeWindow;
    }

    uint256 public constant BATTLE_TIMEOUT = 48 hours;
    /// @notice Pending challenge auto-cancels if defender doesn't accept/decline in this window.
    uint256 public constant CHALLENGE_EXPIRY = 24 hours;
    uint16 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Anti-gambling mechanics (enforced at acceptBattle + claimPayout):
    ///
    /// {MIN_DEFENDER_MATCH_BPS} — defender must stake ≥ 75% of challenger
    ///   stake. Bounds the initial challenger-vs-defender stake ratio so
    ///   that no one can accept a "free option" with zero/trivial stake and
    ///   farm asymmetric upside.
    ///
    /// {MAX_PAYOUT_MULTIPLIER} — each winning bettor receives at most
    ///   {MAX_PAYOUT_MULTIPLIER}× their own stake back. Any surplus on the
    ///   pool (caused by wildly-asymmetric spectator bets) is refunded
    ///   pro-rata to the losing side when they call claimPayout. This
    ///   positions Yap as a skill+skin-in-the-game combat arena rather
    ///   than a lottery.
    uint16 public constant MIN_DEFENDER_MATCH_BPS = 7_500; // 75%
    uint256 public constant MAX_PAYOUT_MULTIPLIER = 5;

    uint8 public constant SIDE_A = 0;
    uint8 public constant SIDE_B = 1;
    uint8 public constant DRAW = 2;

    enum Status {
        Pending,
        Live,
        Verdict,
        Settled,
        Cancelled
    }

    struct Battle {
        uint256 fighterA;
        uint256 fighterB;
        address creator;
        uint64 startTime;
        uint64 verdictTime;
        uint32 maxRounds;
        uint8 winner;
        Status status;
        uint256 poolA;
        uint256 poolB;
        uint256 feeCollected;
        string topic;
        bytes verdictSig;
        /// @notice Commitment to the off-chain transcript + reasoning blob
        ///         (typically a 0G Storage root hash). Bound into the
        ///         oracle's signed digest so a compromised oracle cannot
        ///         sign a winner without producing a matching transcript
        ///         that spectators can audit.
        bytes32 verdictHash;
        /// @notice Sum of all payouts already claimed for this battle.
        ///         Used by {sweepDust} to compute residual dust + abandoned
        ///         stakes after the settlement cooldown elapses.
        uint256 totalClaimed;
        /// @notice Block timestamp when {settle} ran. Used to enforce the
        ///         {DUST_SWEEP_COOLDOWN} before residual sweeps.
        uint64 settledAt;
    }

    /// @notice Time after settlement before residual dust + abandoned stakes
    ///         can be swept to treasury via {sweepDust}.
    uint256 public constant DUST_SWEEP_COOLDOWN = 90 days;

    struct BetOf {
        uint128 amount;
        uint8 side;
        bool claimed;
    }

    address public treasury;
    IBattleRegistry public registry;
    IFighter public immutable fighter;
    uint256 public nextBattleId;

    /// @notice TEE signer address whose ECDSA signature is required on verdict
    ///         submissions. Set to the 0G Compute provider's teeSignerAddress
    ///         (registered in the 0G ServingContract for the chosen judge
    ///         provider). Rotatable by admin via {setOracleKey} when migrating
    ///         to a different provider or when a provider rotates its TEE key.
    ///
    ///         The signature must recover via EIP-191 personal_sign over the
    ///         canonical text {verdictCanonicalText} returns — see
    ///         {submitVerdict} for the full verification path.
    address public oracleKey;

    mapping(uint256 => Battle) public battles;
    mapping(uint256 => mapping(address => BetOf)) public betsOf;

    event BattleCreated(
        uint256 indexed battleId,
        uint256 indexed fighterA,
        uint256 indexed fighterB,
        address creator,
        string topic,
        uint8 maxRounds
    );
    event BattleAccepted(uint256 indexed battleId, address indexed defender);
    event BattleDeclined(uint256 indexed battleId, address indexed defender);
    event BetPlaced(uint256 indexed battleId, address indexed bettor, uint8 side, uint256 amount);
    event VerdictSubmitted(
        uint256 indexed battleId,
        uint8 winner,
        bytes32 verdictHash,
        bytes teeSignature
    );
    event BattleSettled(uint256 indexed battleId, uint8 winner, uint256 fee);
    event SettlementPaused(uint256 indexed battleId, uint64 newDeadline);
    event DisputeFiled(
        uint256 indexed battleId,
        address indexed by,
        bytes32 indexed reasonHash
    );
    event StuckVerdictRefunded(uint256 indexed battleId, address indexed caller);
    event DustSwept(uint256 indexed battleId, uint256 amount);
    event BattleCancelled(uint256 indexed battleId);
    event PayoutClaimed(uint256 indexed battleId, address indexed bettor, uint256 amount);
    event RegistryUpdated(address indexed registry);
    event TreasuryUpdated(address indexed treasury);
    event OracleKeyUpdated(address indexed previousKey, address indexed newKey);
    event DisputeWindowUpdated(uint256 previousWindow, uint256 newWindow);

    error InvalidState();
    error InvalidSide();
    error ZeroAmount();
    error ZeroAddress();
    error NothingToClaim();
    error DisputeWindowActive();
    error TimeoutNotReached();
    error SameFighter();
    error NotFighterUser();
    error ChallengeNotExpired();
    error InvalidOracleSignature();
    error OracleKeyNotSet();
    error DefenderStakeTooLow();
    error DisputeAlreadyExtended();
    error VerdictNotStuck();
    error InvalidVerdictHash();
    error NoDust();
    error InvalidSignedTextFormat();
    error ResponseHashMismatch();
    error CanonicalContentMissing();
    error InvalidContentOffset();

    constructor(
        address admin,
        address treasury_,
        address oracleKey_,
        address fighter_
    ) {
        if (
            admin == address(0) ||
            treasury_ == address(0) ||
            oracleKey_ == address(0) ||
            fighter_ == address(0)
        ) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        treasury = treasury_;
        fighter = IFighter(fighter_);
        oracleKey = oracleKey_;
        disputeWindow = DEFAULT_DISPUTE_WINDOW;
        emit OracleKeyUpdated(address(0), oracleKey_);
    }

    /// @dev Returns true if `user` currently controls `tokenId` — either direct
    ///      owner, or an authorized executor (e.g. an active rental renter).
    function _canUseFighter(uint256 tokenId, address user) internal view returns (bool) {
        if (fighter.ownerOf(tokenId) == user) return true;
        return fighter.isExecutor(tokenId, user);
    }

    // --------------------------------------------------------------------------------------------
    // Admin
    // --------------------------------------------------------------------------------------------

    function setRegistry(address registry_) external onlyRole(ADMIN_ROLE) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IBattleRegistry(registry_);
        emit RegistryUpdated(registry_);
    }

    function setTreasury(address treasury_) external onlyRole(ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Rotate the oracle's public key. Emits an audit event so
    ///         off-chain watchers can detect key ceremonies. The caller
    ///         SHOULD publish the reason (key compromise, scheduled rotation)
    ///         off-chain — the contract only logs the address pair.
    function setOracleKey(address oracleKey_) external onlyRole(ADMIN_ROLE) {
        if (oracleKey_ == address(0)) revert ZeroAddress();
        address prev = oracleKey;
        oracleKey = oracleKey_;
        emit OracleKeyUpdated(prev, oracleKey_);
    }

    /// @notice Adjust the dispute window. Must be between 1 second and
    ///         {MAX_DISPUTE_WINDOW} (7 days). Admin only; applies to all
    ///         future {settle} calls including on already-in-flight battles
    ///         whose dispute window hasn't fully elapsed.
    function setDisputeWindow(uint256 window) external onlyRole(ADMIN_ROLE) {
        if (window == 0 || window > MAX_DISPUTE_WINDOW) {
            revert InvalidState();
        }
        uint256 prev = disputeWindow;
        disputeWindow = window;
        emit DisputeWindowUpdated(prev, window);
    }

    // --------------------------------------------------------------------------------------------
    // Battle lifecycle
    // --------------------------------------------------------------------------------------------

    /// @notice Challenge fighterB with fighterA. The defender (owner/renter of
    ///         fighterB) must call {acceptBattle} before the match goes live.
    /// @dev Only the owner or an authorized executor (renter) of fighterA can
    ///      create the challenge. `msg.value` is escrowed as the challenger's
    ///      bet on side A — this is "skin in the game" that matches the
    ///      existing pari-mutuel settlement logic. Refunded in full if the
    ///      battle ends in Cancelled (challenger withdraws, defender declines,
    ///      or expiry reached). Battle starts in Pending; outside bets are not
    ///      accepted until the defender accepts.
    function createBattle(
        uint256 fighterA,
        uint256 fighterB,
        string calldata topic,
        uint8 maxRounds
    ) external payable returns (uint256 battleId) {
        if (fighterA == fighterB) revert SameFighter();
        if (!_canUseFighter(fighterA, msg.sender)) revert NotFighterUser();
        if (msg.value == 0) revert ZeroAmount();
        battleId = ++nextBattleId;
        Battle storage b = battles[battleId];
        b.fighterA = fighterA;
        b.fighterB = fighterB;
        b.creator = msg.sender;
        // startTime is set to the challenge creation time for the
        // CHALLENGE_EXPIRY window. acceptBattle() overwrites it with the
        // actual go-live timestamp so downstream BATTLE_TIMEOUT math uses
        // the live-start clock.
        b.startTime = uint64(block.timestamp);
        b.maxRounds = maxRounds;
        b.status = Status.Pending;
        b.topic = topic;
        b.poolA = msg.value;

        BetOf storage bet = betsOf[battleId][msg.sender];
        bet.amount = uint128(msg.value);
        bet.side = SIDE_A;

        emit BattleCreated(battleId, fighterA, fighterB, msg.sender, topic, maxRounds);
        emit BetPlaced(battleId, msg.sender, SIDE_A, msg.value);
    }

    /// @notice Defender accepts the challenge with a stake on side B.
    ///         `msg.value` is escrowed as a side-B bet; must be at least
    ///         {MIN_DEFENDER_MATCH_BPS} (75%) of the challenger's side-A
    ///         stake. Zero-stake accept is rejected to prevent "free option"
    ///         games where defender risks nothing but splits the pool.
    ///         Transitions the battle to Live and registers with BattleRegistry.
    function acceptBattle(uint256 battleId) external payable {
        Battle storage b = battles[battleId];
        if (b.status != Status.Pending) revert InvalidState();
        if (!_canUseFighter(b.fighterB, msg.sender)) revert NotFighterUser();

        uint256 minStake = (b.poolA * MIN_DEFENDER_MATCH_BPS) / BPS_DENOMINATOR;
        if (msg.value < minStake) revert DefenderStakeTooLow();

        b.status = Status.Live;
        b.startTime = uint64(block.timestamp);

        BetOf storage bet = betsOf[battleId][msg.sender];
        // Defender may already have a pending-bet entry if they somehow
        // bet earlier — defensive accumulate. Side must match.
        if (bet.amount > 0 && bet.side != SIDE_B) revert InvalidSide();
        bet.amount = uint128(uint256(bet.amount) + msg.value);
        bet.side = SIDE_B;
        b.poolB += msg.value;
        emit BetPlaced(battleId, msg.sender, SIDE_B, msg.value);

        if (address(registry) != address(0)) {
            registry.registerBattle(battleId, b.fighterA, b.fighterB, b.topic);
        }

        emit BattleAccepted(battleId, msg.sender);
    }

    /// @notice Defender declines the challenge. Battle moves to Cancelled.
    function declineBattle(uint256 battleId) external {
        Battle storage b = battles[battleId];
        if (b.status != Status.Pending) revert InvalidState();
        if (!_canUseFighter(b.fighterB, msg.sender)) revert NotFighterUser();

        b.status = Status.Cancelled;

        emit BattleDeclined(battleId, msg.sender);
        emit BattleCancelled(battleId);
    }

    function placeBet(uint256 battleId, uint8 side, uint256 amount)
        external
        payable
        nonReentrant
    {
        if (side > SIDE_B) revert InvalidSide();
        if (amount == 0 || msg.value != amount) revert ZeroAmount();
        Battle storage b = battles[battleId];
        if (b.status != Status.Live) revert InvalidState();

        BetOf storage bet = betsOf[battleId][msg.sender];
        if (bet.amount > 0 && bet.side != side) revert InvalidSide();
        bet.amount = uint128(uint256(bet.amount) + amount);
        bet.side = side;

        if (side == SIDE_A) {
            b.poolA += amount;
        } else {
            b.poolB += amount;
        }

        emit BetPlaced(battleId, msg.sender, side, amount);
    }

    /// @notice Submit a verdict for a live battle, verifying the 0G Compute
    ///         provider's TEE attestation routing-proof. Anyone can call;
    ///         authorization is cryptographic.
    /// @dev The provider's enclave personal-signs the routing-proof text
    ///        `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>`
    ///      using its TEE-derived ECDSA key (registered as oracleKey). To bind
    ///      this attestation to OUR specific verdict, the contract:
    ///        1. Verifies ECDSA recovery on EIP-191(signedText) → oracleKey
    ///        2. Parses the second colon-delimited field of signedText as the
    ///           response-body sha256, and confirms sha256(responseBody) matches
    ///        3. Reconstructs the canonical YAP_VERDICT text from on-chain inputs
    ///           and confirms it appears verbatim at responseBody[contentOffset:]
    ///           between JSON quote characters (i.e. it is the LLM's output)
    ///      Together this proves: (a) the response came from this TEE provider's
    ///      enclave, (b) the response wasn't tampered, (c) the response contains
    ///      our exact verdict commitment for this battle/contract/chain.
    /// @param responseBody Full HTTP response body bytes the broker hashed —
    ///        typically the OpenAI chat-completion JSON envelope.
    /// @param contentOffset Byte offset in responseBody where the canonical
    ///        verdict text begins (i.e. position of the YAP_VERDICT prefix
    ///        inside the JSON `"content":"…"` field). Pre/post bytes must be
    ///        ASCII double-quote so the offset cannot point inside an unrelated
    ///        substring of the JSON.
    /// @param signedText The routing-proof text as the broker formatted it,
    ///        of the form
    ///        `<64 hex>:<64 hex>:<providerType>:<providerIdentity>:<64 hex>`.
    ///        We only assert the first two fields are 64 hex chars separated
    ///        by colons; remaining fields are opaque to the contract but bound
    ///        into the signature.
    /// @param teeSignature 65-byte ECDSA signature (r||s||v) from the provider
    ///        enclave's teeSignerAddress.
    function submitVerdict(
        uint256 battleId,
        uint8 winner,
        bytes32 verdictHash,
        bytes calldata responseBody,
        uint256 contentOffset,
        bytes calldata signedText,
        bytes calldata teeSignature
    ) external {
        if (winner > DRAW) revert InvalidSide();
        if (verdictHash == bytes32(0)) revert InvalidVerdictHash();
        if (oracleKey == address(0)) revert OracleKeyNotSet();
        Battle storage b = battles[battleId];
        if (b.status != Status.Live) revert InvalidState();

        // 1. ECDSA recovery on EIP-191 of signedText → oracleKey.
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(signedText);
        if (digest.recover(teeSignature) != oracleKey) {
            revert InvalidOracleSignature();
        }

        // 2. Parse 2nd field of signedText (response sha256) and verify the
        //    submitted responseBody hashes to it. Format expectation:
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

        // 3. Reconstruct canonical and confirm it lives at responseBody[contentOffset:]
        //    between JSON quote characters (so contentOffset cannot point at
        //    an unrelated substring elsewhere in the JSON envelope).
        bytes memory canonical = _verdictCanonicalText(battleId, winner, verdictHash);
        _verifyCanonicalAtOffset(responseBody, contentOffset, canonical);

        b.status = Status.Verdict;
        b.winner = winner;
        b.verdictTime = uint64(block.timestamp);
        b.verdictSig = teeSignature;
        b.verdictHash = verdictHash;

        emit VerdictSubmitted(battleId, winner, verdictHash, teeSignature);
    }

    /// @dev Converts 64 ASCII hex characters at `data[offset..offset+64]` into a
    ///      bytes32 value. Reverts on out-of-bounds or invalid hex chars.
    function _hex64ToBytes32(bytes calldata data, uint256 offset)
        internal
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

    /// @dev Verifies that {canonical} bytes appear at responseBody[offset:offset+canonical.length]
    ///      and that the byte immediately before {offset} and immediately after
    ///      the canonical run are both ASCII double-quote chars. The quote
    ///      requirement prevents an attacker from passing an offset that points
    ///      at an unrelated substring inside the JSON envelope (e.g. inside a
    ///      different field, or spanning two field boundaries).
    function _verifyCanonicalAtOffset(
        bytes calldata responseBody,
        uint256 offset,
        bytes memory canonical
    ) internal pure {
        uint256 len = canonical.length;
        // offset must be ≥ 1 (so we can read the pre-byte) and the canonical
        // run plus the post-byte must fit inside responseBody.
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

    /// @notice View helper — returns the EIP-191 personal_sign digest of an
    ///         arbitrary signedText payload. Useful for off-chain clients that
    ///         want to reproduce the digest the contract verifies.
    function teeSignedTextDigest(bytes calldata signedText)
        external
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toEthSignedMessageHash(signedText);
    }

    /// @notice View helper — returns the raw canonical text that the 0G
    ///         Compute TEE provider signs. Used off-chain by the judge prompt
    ///         to instruct the LLM on the exact bytes it must output, and by
    ///         clients verifying signatures locally. Format:
    ///         `YAP_VERDICT|<chainid>|<escrow>|<battleId>|<winner>|<verdictHash>`
    function verdictCanonicalText(
        uint256 battleId,
        uint8 winner,
        bytes32 verdictHash
    ) external view returns (string memory) {
        return string(_verdictCanonicalText(battleId, winner, verdictHash));
    }

    /// @dev Reconstructs the canonical verdict text bytes that the TEE
    ///      provider signs. Lowercase hex matches OpenZeppelin Strings'
    ///      toHexString output and the prompt template that pins the LLM
    ///      to lowercase identifiers.
    function _verdictCanonicalText(
        uint256 battleId,
        uint8 winner,
        bytes32 verdictHash
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            "YAP_VERDICT|",
            Strings.toString(block.chainid),
            "|",
            Strings.toHexString(uint160(address(this)), 20),
            "|",
            Strings.toString(battleId),
            "|",
            Strings.toString(uint256(winner)),
            "|",
            Strings.toHexString(uint256(verdictHash), 32)
        );
    }

    /// @notice Admin extends the dispute window for a single battle by
    ///         {DISPUTE_EXTENSION}. One-shot — second call reverts. Used when
    ///         a credible off-chain dispute arrives within the standard window
    ///         and the team needs more time to investigate before settlement.
    function pauseSettlement(uint256 battleId) external onlyRole(ADMIN_ROLE) {
        Battle storage b = battles[battleId];
        if (b.status != Status.Verdict) revert InvalidState();
        if (disputeExtended[battleId]) revert DisputeAlreadyExtended();

        uint64 baseDeadline = b.verdictTime + uint64(disputeWindow);
        uint64 newDeadline = baseDeadline + uint64(DISPUTE_EXTENSION);
        disputeDeadline[battleId] = newDeadline;
        disputeExtended[battleId] = true;
        emit SettlementPaused(battleId, newDeadline);
    }

    /// @notice Anyone with skin in the game (a non-zero bet on the battle)
    ///         can record a dispute against a submitted verdict. The
    ///         {reasonHash} is a commitment (e.g. 0G Storage root) to the
    ///         off-chain dispute artifact (signed message + evidence). The
    ///         contract only logs the event for off-chain indexers; admin
    ///         decides whether to call {pauseSettlement} based on the dispute
    ///         content. Callable while in Verdict status.
    function fileDispute(uint256 battleId, bytes32 reasonHash) external {
        if (reasonHash == bytes32(0)) revert InvalidVerdictHash();
        Battle storage b = battles[battleId];
        if (b.status != Status.Verdict) revert InvalidState();
        if (betsOf[battleId][msg.sender].amount == 0) revert NotFighterUser();
        emit DisputeFiled(battleId, msg.sender, reasonHash);
    }

    /// @notice Deadman switch. If a battle has been in Verdict status for
    ///         {STUCK_VERDICT_TIMEOUT} (30 days) without {settle}, anyone can
    ///         force the battle into Cancelled status so participants can
    ///         claim full refunds. Protects against operator inaction.
    function refundStuckVerdict(uint256 battleId) external {
        Battle storage b = battles[battleId];
        if (b.status != Status.Verdict) revert InvalidState();
        if (block.timestamp < uint256(b.verdictTime) + STUCK_VERDICT_TIMEOUT) {
            revert VerdictNotStuck();
        }
        b.status = Status.Cancelled;
        emit StuckVerdictRefunded(battleId, msg.sender);
        emit BattleCancelled(battleId);
    }

    function settle(uint256 battleId) external nonReentrant {
        Battle storage b = battles[battleId];
        if (b.status != Status.Verdict) revert InvalidState();
        uint256 deadline = disputeDeadline[battleId] != 0
            ? uint256(disputeDeadline[battleId])
            : uint256(b.verdictTime) + disputeWindow;
        if (block.timestamp < deadline) {
            revert DisputeWindowActive();
        }

        uint256 winnerPool;
        if (b.winner == SIDE_A) winnerPool = b.poolA;
        else if (b.winner == SIDE_B) winnerPool = b.poolB;

        uint256 fee;
        // draw or single-side-only battles return stakes in full (handled in claimPayout).
        if (b.winner != DRAW && winnerPool > 0 && (b.poolA + b.poolB) > winnerPool) {
            fee = ((b.poolA + b.poolB) * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            b.feeCollected = fee;
        }

        b.status = Status.Settled;
        b.settledAt = uint64(block.timestamp);

        if (address(registry) != address(0)) {
            registry.finalizeBattle(battleId, b.winner);
        }
        if (fee > 0) {
            Address.sendValue(payable(treasury), fee);
        }

        emit BattleSettled(battleId, b.winner, fee);
    }

    /// @notice Sweep residual dust + abandoned stakes for a fully-cooled-down
    ///         settled battle. Computes residual = poolA + poolB - fee -
    ///         totalClaimed; any positive remainder is forwarded to treasury.
    ///         Callable by admin after {DUST_SWEEP_COOLDOWN} (90d) post-settle.
    ///         Idempotent — second call reverts with NoDust because zeroes
    ///         out totalClaimed bookkeeping.
    function sweepDust(uint256 battleId)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        Battle storage b = battles[battleId];
        if (b.status != Status.Settled) revert InvalidState();
        if (
            block.timestamp <
            uint256(b.settledAt) + DUST_SWEEP_COOLDOWN
        ) {
            revert TimeoutNotReached();
        }
        uint256 escrowed = b.poolA + b.poolB - b.feeCollected;
        uint256 dust = escrowed > b.totalClaimed
            ? escrowed - b.totalClaimed
            : 0;
        if (dust == 0) revert NoDust();

        // Mark all funds claimed so re-entry / re-call cannot drain again.
        b.totalClaimed = escrowed;
        Address.sendValue(payable(treasury), dust);
        emit DustSwept(battleId, dust);
    }

    /// @notice Cancel a battle. Permitted when:
    ///         - Live + BATTLE_TIMEOUT passed (anyone can cancel a stuck live battle)
    ///         - Pending + challenger (creator) calls to withdraw before accept
    ///         - Pending + CHALLENGE_EXPIRY passed (anyone can garbage-collect)
    function cancel(uint256 battleId) external {
        Battle storage b = battles[battleId];
        if (b.status == Status.Live) {
            if (block.timestamp < uint256(b.startTime) + BATTLE_TIMEOUT) {
                revert TimeoutNotReached();
            }
        } else if (b.status == Status.Pending) {
            // Challenger can always withdraw; anyone can after the expiry.
            bool expired = block.timestamp >=
                uint256(b.startTime) + CHALLENGE_EXPIRY;
            if (msg.sender != b.creator && !expired) {
                revert ChallengeNotExpired();
            }
        } else {
            revert InvalidState();
        }
        b.status = Status.Cancelled;
        emit BattleCancelled(battleId);
    }

    function claimPayout(uint256 battleId) external nonReentrant {
        Battle storage b = battles[battleId];
        BetOf storage bet = betsOf[battleId][msg.sender];

        if (bet.amount == 0 || bet.claimed) revert NothingToClaim();

        uint256 payout;
        if (b.status == Status.Settled) {
            if (b.winner == DRAW) {
                payout = bet.amount;
            } else {
                uint256 winnerPool = (b.winner == SIDE_A) ? b.poolA : b.poolB;
                uint256 loserPool = (b.winner == SIDE_A) ? b.poolB : b.poolA;
                uint256 netPool = b.poolA + b.poolB - b.feeCollected;
                if (winnerPool == 0) {
                    // Degenerate case (no bets on winning side) — refund.
                    payout = bet.amount;
                } else if (bet.side == b.winner) {
                    // Winner: pro-rata share of the net pool, capped at
                    // MAX_PAYOUT_MULTIPLIER × stake. The cap is applied
                    // per-bettor so no individual can farm extreme upside
                    // from spectator asymmetry.
                    uint256 prorata = (uint256(bet.amount) * netPool) / winnerPool;
                    uint256 cap = uint256(bet.amount) * MAX_PAYOUT_MULTIPLIER;
                    payout = prorata <= cap ? prorata : cap;
                } else {
                    // Loser: normally zero, but if the winners-pool cap
                    // produced a surplus (net pool > MAX × winnerPool)
                    // that surplus is refunded pro-rata to the losing
                    // side. Turns asymmetric markets into "everyone gets
                    // something back" instead of a windfall for one side.
                    uint256 maxWinnerTake = winnerPool * MAX_PAYOUT_MULTIPLIER;
                    if (netPool > maxWinnerTake && loserPool > 0) {
                        uint256 surplus = netPool - maxWinnerTake;
                        payout = (uint256(bet.amount) * surplus) / loserPool;
                    }
                }
            }
        } else if (b.status == Status.Cancelled) {
            payout = bet.amount;
        } else {
            revert InvalidState();
        }

        bet.claimed = true;
        if (payout > 0) {
            b.totalClaimed += payout;
            Address.sendValue(payable(msg.sender), payout);
        }

        emit PayoutClaimed(battleId, msg.sender, payout);
    }

    // --------------------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------------------

    function getBattle(uint256 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    function getBet(uint256 battleId, address bettor) external view returns (BetOf memory) {
        return betsOf[battleId][bettor];
    }
}
