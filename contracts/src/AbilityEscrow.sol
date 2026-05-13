// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {YapFighter} from "./YapFighter.sol";
import {BattleEscrow} from "./BattleEscrow.sol";

/// @title AbilityEscrow — per-battle archetype-ability use tracking.
/// @notice Each fighter has one ability, fixed at mint by their committed
///         archetype. The ability is gated by a trait-score threshold that
///         must be cleared at mint (via TEE-attested {YapFighter.recordMintScores}).
///         During a Live battle, the fighter's controller calls {useAbility}
///         at most once per side to declare the ability is being deployed
///         this round; the off-chain runner consults {isAbilityUsed} +
///         {getAbilityUsage} between rounds to actually apply the ability's
///         effect on the next inference call.
///
///         The contract holds no value, so reentrancy is not a concern. The
///         only state is per-battle usage flags; cross-contract reads to
///         {BattleEscrow} (fighter ids + battle status) and {YapFighter}
///         (archetype + traits) resolve the gate at call time.
contract AbilityEscrow is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint8 public constant SIDE_A = 0;
    uint8 public constant SIDE_B = 1;

    /// @notice Per-side per-battle usage state. {roundA}/{roundB} record
    ///         the 1-indexed round number on which the side declared its
    ///         ability use; zero means unused. {sideA}/{sideB} are the
    ///         explicit "already used" guard so a side can't double-dip.
    struct Used {
        bool sideA;
        bool sideB;
        uint64 roundA;
        uint64 roundB;
    }
    mapping(uint256 => Used) public abilityUsage;

    BattleEscrow public immutable escrow;
    YapFighter public immutable fighter;

    event AbilityUsed(
        uint256 indexed battleId,
        uint8 indexed side,
        uint256 fighterTokenId,
        YapFighter.Archetype archetype,
        uint8 round
    );

    error InvalidSide();
    error InvalidRound();
    error BattleNotLive();
    error AbilityAlreadyUsed();
    error AbilityGateUnmet();
    error NotAuthorized();
    error ZeroAddress();

    constructor(address escrow_, address fighter_, address admin) {
        if (escrow_ == address(0) || fighter_ == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        escrow = BattleEscrow(payable(escrow_));
        fighter = YapFighter(fighter_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @notice Declare that `side` is deploying its archetype ability on
    ///         the given round of `battleId`. Reverts unless:
    ///           - side ∈ {SIDE_A, SIDE_B}
    ///           - battle is in Live status
    ///           - round is in 1..maxRounds
    ///           - side hasn't already used its ability this battle
    ///           - caller is the fighter's owner, an authorized executor,
    ///             or a RUNNER_ROLE bearer on the fighter contract
    ///           - the fighter's trait score for its archetype's gate trait
    ///             meets the per-archetype threshold (see {requiredScore})
    function useAbility(uint256 battleId, uint8 side, uint8 round) external {
        if (side > SIDE_B) revert InvalidSide();

        BattleEscrow.Battle memory b = escrow.getBattle(battleId);
        if (b.status != BattleEscrow.Status.Live) revert BattleNotLive();
        if (round == 0 || round > b.maxRounds) revert InvalidRound();

        Used storage u = abilityUsage[battleId];
        bool alreadyUsed = side == SIDE_A ? u.sideA : u.sideB;
        if (alreadyUsed) revert AbilityAlreadyUsed();

        uint256 fighterTokenId = side == SIDE_A ? b.fighterA : b.fighterB;

        // Auth — owner, authorized executor, or a global runner.
        bool isOwner_ = fighter.ownerOf(fighterTokenId) == msg.sender;
        bool isExecutor_ = fighter.isExecutor(fighterTokenId, msg.sender);
        bool isRunner_ = fighter.hasRole(fighter.RUNNER_ROLE(), msg.sender);
        if (!isOwner_ && !isExecutor_ && !isRunner_) revert NotAuthorized();

        // Gate — the archetype's required trait must clear its threshold.
        YapFighter.Archetype arch = fighter.getArchetype(fighterTokenId);
        uint8[5] memory traits = fighter.getTraits(fighterTokenId);
        (uint8 traitIdx, uint8 minScore) = _gate(arch);
        if (traits[traitIdx] < minScore) revert AbilityGateUnmet();

        if (side == SIDE_A) {
            u.sideA = true;
            u.roundA = round;
        } else {
            u.sideB = true;
            u.roundB = round;
        }

        emit AbilityUsed(battleId, side, fighterTokenId, arch, round);
    }

    /// @notice Returns the (trait index, minimum score) gate for the given
    ///         archetype. Trait index references the `uint8[5]` layout
    ///         emitted by {YapFighter.getTraits}:
    ///           0 = Logos, 1 = Rhetoric, 2 = Aggression,
    ///           3 = Range, 4 = Concreteness.
    function requiredScore(YapFighter.Archetype archetype)
        external
        pure
        returns (uint8 traitIdx, uint8 minScore)
    {
        return _gate(archetype);
    }

    /// @dev Per-archetype gate table:
    ///        Roaster      → Aggression ≥3
    ///        Debater      → Logos      ≥3
    ///        Philosopher  → Logos      ≥4
    ///        Troll        → Aggression ≥4
    ///        Scholar      → Range      ≥3
    ///        Provocateur  → Rhetoric   ≥3
    function _gate(YapFighter.Archetype archetype)
        internal
        pure
        returns (uint8 traitIdx, uint8 minScore)
    {
        if (archetype == YapFighter.Archetype.Roaster) {
            return (2, 3);
        } else if (archetype == YapFighter.Archetype.Debater) {
            return (0, 3);
        } else if (archetype == YapFighter.Archetype.Philosopher) {
            return (0, 4);
        } else if (archetype == YapFighter.Archetype.Troll) {
            return (2, 4);
        } else if (archetype == YapFighter.Archetype.Scholar) {
            return (3, 3);
        } else {
            // Provocateur
            return (1, 3);
        }
    }

    function isAbilityUsed(uint256 battleId, uint8 side)
        external
        view
        returns (bool)
    {
        if (side > SIDE_B) revert InvalidSide();
        Used storage u = abilityUsage[battleId];
        return side == SIDE_A ? u.sideA : u.sideB;
    }

    /// @notice Returns the (used, round) pair for a side. round == 0 when
    ///         used == false.
    function getAbilityUsage(uint256 battleId, uint8 side)
        external
        view
        returns (bool used, uint64 round)
    {
        if (side > SIDE_B) revert InvalidSide();
        Used storage u = abilityUsage[battleId];
        if (side == SIDE_A) return (u.sideA, u.roundA);
        return (u.sideB, u.roundB);
    }
}
