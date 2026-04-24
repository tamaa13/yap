"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { adaptBattle, type OnChainBattleRaw } from "@/lib/on-chain";
import type { Bet } from "@/lib/types";

const ONEG = 1e18;

// Mine = bets whose `bettor` matches the connected address. We enumerate via
// BetPlaced events, then read the current state per (battleId, bettor) from
// the `betsOf` mapping to reflect the latest accumulated amount + claim flag.
export function useMyBets() {
  const { address } = useAccount();
  const client = usePublicClient();

  const [battleIds, setBattleIds] = useState<bigint[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    if (!client || !address || BATTLE_ESCROW_ADDRESS === "") {
      setBattleIds([]);
      setEventsLoading(false);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
          abi: BATTLE_ESCROW_ABI,
          eventName: "BetPlaced",
          args: { bettor: address },
          fromBlock: 0n,
          toBlock: "latest",
        });
        const seen = new Set<string>();
        for (const log of logs) {
          const args = (log as unknown as { args: { battleId?: bigint } }).args;
          if (args.battleId !== undefined) seen.add(args.battleId.toString());
        }
        if (!cancelled) {
          setBattleIds(Array.from(seen).map((s) => BigInt(s)).sort((a, b) => Number(a - b)));
          setEventsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setBattleIds([]);
          setEventsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, address]);

  const betReads = useReadContracts({
    allowFailure: true,
    contracts: address
      ? battleIds.flatMap((id) => [
          {
            address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
            abi: BATTLE_ESCROW_ABI,
            functionName: "getBet",
            args: [id, address],
          },
          {
            address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
            abi: BATTLE_ESCROW_ABI,
            functionName: "getBattle",
            args: [id],
          },
        ])
      : [],
    query: { enabled: battleIds.length > 0 && !!address },
  });

  const bets: Bet[] = [];
  if (betReads.data) {
    for (let i = 0; i < battleIds.length; i++) {
      const [betRes, battleRes] = betReads.data.slice(i * 2, i * 2 + 2);
      if (betRes.status !== "success" || battleRes.status !== "success") continue;
      const betStruct = betRes.result as { amount: bigint; side: number; claimed: boolean };
      if (betStruct.amount === 0n) continue;
      const battle = adaptBattle(battleIds[i], battleRes.result as OnChainBattleRaw);
      const amount = Number(betStruct.amount) / ONEG;
      const odds = betStruct.side === 0 ? battle.oddsA : battle.oddsB;
      const potential = +(amount * odds).toFixed(2);
      const settled = battle.status === "past";
      const won = settled && battle.winner === (betStruct.side === 0 ? "a" : "b");
      bets.push({
        id: `${battle.id}:${betStruct.side}`,
        battleId: battle.id,
        side: betStruct.side === 0 ? "a" : "b",
        amount,
        odds,
        status: !settled ? "active" : won ? "won" : "lost",
        potential: !settled ? potential : undefined,
        payout: settled && won ? potential : settled ? 0 : undefined,
        pnl: settled ? (won ? potential - amount : -amount) : undefined,
      });
    }
  }

  return {
    data: bets,
    isLoading: eventsLoading || betReads.isLoading,
    error: betReads.error,
    refetch: betReads.refetch,
  } as const;
}
