"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
} from "@/lib/contracts";

/** Battle status values from BattleEscrow.Status enum. */
const STATUS_PENDING = 0;

export interface PendingChallenge {
  battleId: number;
  fighterA: number;
  fighterB: number;
  topic: string;
  challenger: `0x${string}`;
  defenderFighterOwner: `0x${string}`;
  createdAt: number; // ms
  /** ms epoch when challenge auto-expires. */
  expiresAt: number;
}

/**
 * Returns pending battle challenges where the connected wallet owns fighterB
 * (incoming) or fighterA (outgoing). Lightweight for hackathon scale —
 * scans BattleCreated events from block 0 and filters by on-chain status.
 * For production, replace with a subgraph or event-cursor sync.
 */
export function usePendingChallenges(user: `0x${string}` | undefined) {
  const client = usePublicClient();
  const [battleIds, setBattleIds] = useState<bigint[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // 24h expiry window matches CHALLENGE_EXPIRY in BattleEscrow.
  const CHALLENGE_EXPIRY_MS = 24 * 3600 * 1000;

  useEffect(() => {
    if (!client || !user || BATTLE_ESCROW_ADDRESS === "") {
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
          eventName: "BattleCreated",
          fromBlock: 0n,
          toBlock: "latest",
        });
        const ids: bigint[] = [];
        for (const log of logs) {
          const args = (log as unknown as { args: { battleId?: bigint } }).args;
          if (args.battleId !== undefined) ids.push(args.battleId);
        }
        if (!cancelled) {
          setBattleIds(ids);
          setEventsLoading(false);
        }
      } catch {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, user]);

  // Read battle state + fighterB owner for each candidate.
  const battleReads = useReadContracts({
    allowFailure: true,
    contracts:
      battleIds.length > 0
        ? battleIds.map((id) => ({
            address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
            abi: BATTLE_ESCROW_ABI,
            functionName: "getBattle",
            args: [id],
          }))
        : [],
    query: { enabled: battleIds.length > 0 },
  });

  // Second wave: read fighterB owner for each to check "I am the defender".
  // We do this even before filtering to keep the indices aligned; worst case
  // is a few extra reads on battles not relevant to this user.
  const ownerReads = useReadContracts({
    allowFailure: true,
    contracts:
      battleReads.data && FIGHTER_INFT_ADDRESS !== ""
        ? battleReads.data.map((_, i) => {
            const battle =
              battleReads.data?.[i].status === "success"
                ? (battleReads.data[i].result as
                    | {
                        fighterA: bigint;
                        fighterB: bigint;
                        status: number;
                      }
                    | [
                        bigint,
                        bigint,
                        `0x${string}`,
                        bigint,
                        bigint,
                        number,
                        number,
                        number,
                        bigint,
                        bigint,
                        bigint,
                        string,
                        `0x${string}`,
                      ])
                : null;
            const fighterB = Array.isArray(battle)
              ? battle[1]
              : battle?.fighterB;
            return {
              address: FIGHTER_INFT_ADDRESS as `0x${string}`,
              abi: FIGHTER_INFT_ABI,
              functionName: "ownerOf",
              args: [fighterB ?? 0n],
            };
          })
        : [],
    query: { enabled: !!battleReads.data && FIGHTER_INFT_ADDRESS !== "" },
  });

  const incoming: PendingChallenge[] = [];
  const outgoing: PendingChallenge[] = [];

  if (battleReads.data && user) {
    for (let i = 0; i < battleIds.length; i++) {
      const res = battleReads.data[i];
      if (res.status !== "success") continue;
      const raw = res.result as unknown;
      // Battle struct decode (both tuple and object forms).
      let fighterA: bigint,
        fighterB: bigint,
        creator: `0x${string}`,
        startTime: bigint,
        status: number,
        topic: string;
      if (Array.isArray(raw)) {
        [fighterA, fighterB, creator, startTime, , , , status] = raw as [
          bigint,
          bigint,
          `0x${string}`,
          bigint,
          bigint,
          number,
          number,
          number,
          bigint,
          bigint,
          bigint,
          string,
          `0x${string}`,
        ];
        topic = (raw as [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, string])[11];
      } else if (raw && typeof raw === "object") {
        const obj = raw as {
          fighterA: bigint;
          fighterB: bigint;
          creator: `0x${string}`;
          startTime: bigint;
          status: number;
          topic: string;
        };
        fighterA = obj.fighterA;
        fighterB = obj.fighterB;
        creator = obj.creator;
        startTime = obj.startTime;
        status = obj.status;
        topic = obj.topic;
      } else {
        continue;
      }

      if (status !== STATUS_PENDING) continue;

      const ownerRes = ownerReads.data?.[i];
      const fighterBOwner =
        ownerRes?.status === "success" ? (ownerRes.result as `0x${string}`) : null;

      const createdAt = Number(startTime) * 1000;
      const expiresAt = createdAt + CHALLENGE_EXPIRY_MS;
      if (expiresAt <= Date.now()) continue; // skip expired

      const challenge: PendingChallenge = {
        battleId: Number(battleIds[i]),
        fighterA: Number(fighterA),
        fighterB: Number(fighterB),
        topic,
        challenger: creator,
        defenderFighterOwner: (fighterBOwner ??
          "0x0000000000000000000000000000000000000000") as `0x${string}`,
        createdAt,
        expiresAt,
      };

      const lu = user.toLowerCase();
      if (fighterBOwner && fighterBOwner.toLowerCase() === lu) {
        incoming.push(challenge);
      }
      if (creator.toLowerCase() === lu) {
        outgoing.push(challenge);
      }
    }
  }

  return {
    incoming,
    outgoing,
    isLoading: eventsLoading || battleReads.isLoading,
  };
}
