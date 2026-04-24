// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";

/// @title BattleRegistry — immutable match history & ELO tracker for Yap fighters.
/// @notice Mutations gated to the escrow contract (ESCROW_ROLE). Tracks per-fighter stats and a
///         paginated per-fighter battle history.
contract BattleRegistry is AccessControl {
    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint32 public constant DEFAULT_ELO = 1200;
    uint32 public constant K_FACTOR = 32;

    struct RoundRecord {
        uint8 round;
        uint16 scoreA;
        uint16 scoreB;
        bytes verdictSig;
    }

    struct Battle {
        uint256 battleId;
        uint256 fighterA;
        uint256 fighterB;
        string topic;
        uint64 startTime;
        uint64 endTime;
        uint8 winner; // 0=A, 1=B, 2=draw
        bool finalized;
        RoundRecord[] rounds;
    }

    struct FighterStats {
        uint32 elo;
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint256 earnings; // placeholder, wired up externally
    }

    mapping(uint256 => Battle) private _battles;
    mapping(uint256 => FighterStats) private _stats;
    mapping(uint256 => uint256[]) private _history; // fighterId → battleIds

    event BattleRegistered(
        uint256 indexed battleId,
        uint256 indexed fighterA,
        uint256 indexed fighterB,
        string topic
    );
    event RoundRecorded(
        uint256 indexed battleId,
        uint8 indexed round,
        uint16 scoreA,
        uint16 scoreB,
        bytes verdictSig
    );
    event BattleFinalized(
        uint256 indexed battleId,
        uint8 winner,
        uint32 eloA,
        uint32 eloB
    );

    error UnknownBattle();
    error AlreadyRegistered();
    error AlreadyFinalized();
    error InvalidWinner();
    error ZeroAddress();

    constructor(address admin, address escrow) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        if (escrow != address(0)) {
            _grantRole(ESCROW_ROLE, escrow);
        }
    }

    function setEscrow(address escrow) external onlyRole(ADMIN_ROLE) {
        if (escrow == address(0)) revert ZeroAddress();
        _grantRole(ESCROW_ROLE, escrow);
    }

    // --------------------------------------------------------------------------------------------
    // Mutations (onlyEscrow)
    // --------------------------------------------------------------------------------------------

    function registerBattle(
        uint256 battleId,
        uint256 fighterA,
        uint256 fighterB,
        string calldata topic
    ) external onlyRole(ESCROW_ROLE) {
        Battle storage b = _battles[battleId];
        if (b.battleId != 0) revert AlreadyRegistered();
        b.battleId = battleId;
        b.fighterA = fighterA;
        b.fighterB = fighterB;
        b.topic = topic;
        b.startTime = uint64(block.timestamp);

        _history[fighterA].push(battleId);
        _history[fighterB].push(battleId);

        if (_stats[fighterA].elo == 0) _stats[fighterA].elo = DEFAULT_ELO;
        if (_stats[fighterB].elo == 0) _stats[fighterB].elo = DEFAULT_ELO;

        emit BattleRegistered(battleId, fighterA, fighterB, topic);
    }

    function recordRound(
        uint256 battleId,
        uint8 round,
        uint16 scoreA,
        uint16 scoreB,
        bytes calldata verdictSig
    ) external onlyRole(ESCROW_ROLE) {
        Battle storage b = _battles[battleId];
        if (b.battleId == 0) revert UnknownBattle();
        if (b.finalized) revert AlreadyFinalized();
        b.rounds.push(RoundRecord({
            round: round,
            scoreA: scoreA,
            scoreB: scoreB,
            verdictSig: verdictSig
        }));
        emit RoundRecorded(battleId, round, scoreA, scoreB, verdictSig);
    }

    function finalizeBattle(uint256 battleId, uint8 winner) external onlyRole(ESCROW_ROLE) {
        if (winner > 2) revert InvalidWinner();
        Battle storage b = _battles[battleId];
        if (b.battleId == 0) revert UnknownBattle();
        if (b.finalized) revert AlreadyFinalized();

        b.finalized = true;
        b.winner = winner;
        b.endTime = uint64(block.timestamp);

        FighterStats storage sa = _stats[b.fighterA];
        FighterStats storage sb = _stats[b.fighterB];

        (uint32 newEloA, uint32 newEloB) = _eloUpdate(sa.elo, sb.elo, winner);
        sa.elo = newEloA;
        sb.elo = newEloB;

        if (winner == 0) {
            ++sa.wins;
            ++sb.losses;
        } else if (winner == 1) {
            ++sa.losses;
            ++sb.wins;
        } else {
            ++sa.draws;
            ++sb.draws;
        }

        emit BattleFinalized(battleId, winner, newEloA, newEloB);
    }

    // --------------------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------------------

    function fighterStats(uint256 tokenId)
        external
        view
        returns (uint32 elo, uint32 wins, uint32 losses, uint256 earnings)
    {
        FighterStats storage s = _stats[tokenId];
        elo = s.elo == 0 ? DEFAULT_ELO : s.elo;
        wins = s.wins;
        losses = s.losses;
        earnings = s.earnings;
    }

    function fighterDraws(uint256 tokenId) external view returns (uint32) {
        return _stats[tokenId].draws;
    }

    function battleOf(uint256 battleId) external view returns (Battle memory) {
        return _battles[battleId];
    }

    function historyLength(uint256 tokenId) external view returns (uint256) {
        return _history[tokenId].length;
    }

    function battleHistory(uint256 tokenId, uint256 offset, uint256 limit)
        external
        view
        returns (Battle[] memory out)
    {
        uint256[] storage ids = _history[tokenId];
        uint256 len = ids.length;
        if (offset >= len) return new Battle[](0);
        uint256 remaining = len - offset;
        uint256 n = limit < remaining ? limit : remaining;
        out = new Battle[](n);
        for (uint256 i = 0; i < n; ++i) {
            out[i] = _battles[ids[offset + i]];
        }
    }

    // --------------------------------------------------------------------------------------------
    // ELO (K = 32). expected = 1 / (1 + 10^((opp - self)/400))
    // We compute in fixed-point with 1e4 scale. Outcome: win=1.0, loss=0, draw=0.5.
    // --------------------------------------------------------------------------------------------

    function _eloUpdate(uint32 eloA, uint32 eloB, uint8 winner)
        internal
        pure
        returns (uint32 newA, uint32 newB)
    {
        // scoreA, scoreB ∈ {0, 5000, 10000} scaled by 1e4.
        uint256 scoreA = winner == 0 ? 10_000 : (winner == 1 ? 0 : 5_000);
        uint256 scoreB = 10_000 - scoreA;

        uint256 expA = _expectedScore(eloA, eloB); // 1e4 scaled
        uint256 expB = 10_000 - expA;

        // delta = K * (actual - expected); K scaled by 1e4 to match.
        // newElo = elo + K * (score - exp) / 1e4
        int256 dA = (int256(uint256(K_FACTOR)) * (int256(scoreA) - int256(expA))) / 10_000;
        int256 dB = (int256(uint256(K_FACTOR)) * (int256(scoreB) - int256(expB))) / 10_000;
        newA = uint32(uint256(int256(uint256(eloA)) + dA));
        newB = uint32(uint256(int256(uint256(eloB)) + dB));
    }

    /// @dev Expected score of A vs B, scaled by 1e4.
    ///      Uses the linear approximation expA = 1/(1 + 10^((B-A)/400)) via piecewise table for the
    ///      hackathon; good enough for demo-scale displays. K=32 with actual-exp integer diff keeps
    ///      updates in ±32 range.
    function _expectedScore(uint32 eloA, uint32 eloB) internal pure returns (uint256) {
        int256 diff = int256(uint256(eloA)) - int256(uint256(eloB));
        // Clamp diff to [-800, 800] for the approximation.
        if (diff > 800) diff = 800;
        if (diff < -800) diff = -800;
        // Tabulated 1/(1+10^(-diff/400)) * 10000, sampled every 100 points.
        int16[17] memory table = [
            int16(90),  // diff = -800 : 0.0090
            int16(167), // -700
            int16(303), // -600
            int16(500), // -500
            int16(760), // -400
            int16(1176),// -300
            int16(1754),// -200
            int16(2500),// -100
            int16(5000),// 0
            int16(7500),// +100
            int16(8246),// +200
            int16(8824),// +300
            int16(9240),// +400
            int16(9500),// +500
            int16(9697),// +600
            int16(9833),// +700
            int16(9910) // +800
        ];
        // Map diff to index 0..16 via linear interpolation.
        int256 shifted = diff + 800; // 0..1600
        uint256 idx = uint256(shifted / 100);
        uint256 frac = uint256(shifted % 100);
        if (idx >= 16) return uint256(uint16(table[16]));
        int256 lo = int256(uint256(uint16(table[idx])));
        int256 hi = int256(uint256(uint16(table[idx + 1])));
        int256 interp = lo + ((hi - lo) * int256(frac)) / 100;
        return uint256(interp);
    }
}
