// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/contracts/utils/Address.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

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
///         A TEE oracle submits the signed verdict; after a dispute window, the pool is settled
///         and winners claim their share (pull pattern).
contract BattleEscrow is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @dev Deprecated: kept for historical ABI compatibility. Verdict
    ///      submission is now gated by ECDSA signature verification against
    ///      {oracleKey}, not by role — so any relayer can submit a valid
    ///      oracle verdict. See {submitVerdict}.
    bytes32 public constant TEE_ORACLE_ROLE = keccak256("TEE_ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Default dispute window. Admin can override per-deployment via
    ///         {setDisputeWindow} — 24h is the production-safe default; testnet
    ///         deployments typically lower it for demo purposes.
    uint256 public constant DEFAULT_DISPUTE_WINDOW = 24 hours;
    uint256 public constant MAX_DISPUTE_WINDOW = 7 days;
    uint256 public disputeWindow;

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
    }

    struct BetOf {
        uint128 amount;
        uint8 side;
        bool claimed;
    }

    address public treasury;
    IBattleRegistry public registry;
    IFighter public immutable fighter;
    uint256 public nextBattleId;

    /// @notice Public key (EOA address) whose ECDSA signature is required on
    ///         verdict submissions. Rotatable by admin via {setOracleKey}.
    ///         The oracle service that holds this key must run in an isolated
    ///         environment that has no access to pool state (see README for
    ///         architectural guarantee).
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
    event VerdictSubmitted(uint256 indexed battleId, uint8 winner, bytes teeSignature);
    event BattleSettled(uint256 indexed battleId, uint8 winner, uint256 fee);
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
        // Retain role on the oracle address for backward-compat with any
        // external tooling that still reads it; verdict authorization is
        // now purely signature-based (see submitVerdict).
        _grantRole(TEE_ORACLE_ROLE, oracleKey_);
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

    /// @notice Submit a TEE verdict for a live battle. Anyone can call;
    ///         authorization is cryptographic — the signature must recover to
    ///         {oracleKey}. This decouples verdict authorship (TEE oracle)
    ///         from submission (any relayer, including the battle parties).
    /// @dev Signed payload = `keccak256(abi.encode(address(this), chainid, battleId, winner))`
    ///      wrapped in the EIP-191 personal-sign prefix via {MessageHashUtils.toEthSignedMessageHash}.
    ///      Including the contract address + chain id prevents cross-contract /
    ///      cross-chain replay.
    function submitVerdict(uint256 battleId, uint8 winner, bytes calldata teeSignature)
        external
    {
        if (winner > DRAW) revert InvalidSide();
        if (oracleKey == address(0)) revert OracleKeyNotSet();
        Battle storage b = battles[battleId];
        if (b.status != Status.Live) revert InvalidState();

        bytes32 digest = keccak256(
            abi.encode(address(this), block.chainid, battleId, winner)
        ).toEthSignedMessageHash();
        address signer = digest.recover(teeSignature);
        if (signer != oracleKey) revert InvalidOracleSignature();

        b.status = Status.Verdict;
        b.winner = winner;
        b.verdictTime = uint64(block.timestamp);
        b.verdictSig = teeSignature;

        emit VerdictSubmitted(battleId, winner, teeSignature);
    }

    /// @notice View helper — returns the digest that must be signed by the
    ///         oracle's TEE for a given (battleId, winner). Off-chain signers
    ///         produce the ECDSA signature over this digest.
    function verdictDigest(uint256 battleId, uint8 winner) external view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, battleId, winner))
            .toEthSignedMessageHash();
    }

    function settle(uint256 battleId) external nonReentrant {
        Battle storage b = battles[battleId];
        if (b.status != Status.Verdict) revert InvalidState();
        if (block.timestamp < uint256(b.verdictTime) + disputeWindow) {
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

        if (address(registry) != address(0)) {
            registry.finalizeBattle(battleId, b.winner);
        }
        if (fee > 0) {
            Address.sendValue(payable(treasury), fee);
        }

        emit BattleSettled(battleId, b.winner, fee);
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
