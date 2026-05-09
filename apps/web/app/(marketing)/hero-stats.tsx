"use client";

import { useReadContract } from "wagmi";
import { Split } from "@/components/ui/badge";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { useLeaderboard } from "@/hooks/use-leaderboard";

/**
 * StatStrip — only stats with a real on-chain source. Per
 * project_yap_phasec_rules.md: drop the stat if can't be wired.
 *
 *   ✅ Battles total — BattleEscrow.nextBattleId() - 1
 *   ✅ ELO Leader   — top fighter from useLeaderboard
 *   ❌ Fighters total — no YapFighter.totalSupply() in ABI; dropped.
 *   ❌ OG Escrowed   — no aggregate read on-chain; dropped.
 *
 * That's 2 stats, not 4. Honest empty > pretty fake. When subgraph
 * lands or totalSupply ships in a future contract upgrade, add the
 * dropped stats back.
 */
export function LandingHeroStats() {
  const battlesEnabled = BATTLE_ESCROW_ADDRESS !== "";
  const { data: nextBattleId } = useReadContract({
    address: battlesEnabled
      ? (BATTLE_ESCROW_ADDRESS as `0x${string}`)
      : undefined,
    abi: BATTLE_ESCROW_ABI,
    functionName: "nextBattleId",
    query: { enabled: battlesEnabled },
  });
  const battlesFought =
    typeof nextBattleId === "bigint" && nextBattleId > 0n
      ? Number(nextBattleId) - 1
      : null;

  const { data: top } = useLeaderboard({ metric: "elo", limit: 1 });
  const champion = top[0] ?? null;

  // Both unavailable → render nothing rather than a placeholder strip.
  if (battlesFought === null && !champion) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 1,
        background: "var(--yap-ink-700)",
        border: "1px solid var(--yap-ink-700)",
      }}
    >
      <div
        style={{
          background: "var(--yap-ink-900)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {battlesFought !== null ? (
          <Split
            k="Battles fought"
            v={battlesFought.toLocaleString()}
            size="sm"
          />
        ) : (
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--yap-ink-400)",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Battles · syncing
          </span>
        )}
      </div>
      <div
        style={{
          background: "var(--yap-ink-900)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {champion ? (
          <Split
            k={`Champion · ${champion.name}`}
            v={champion.elo.toLocaleString()}
            tone="crim"
            size="sm"
          />
        ) : (
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--yap-ink-400)",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            ELO leader · waiting on first ranked battle
          </span>
        )}
      </div>
    </div>
  );
}
