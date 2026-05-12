"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
  RENTAL_ESCROW_ABI,
  RENTAL_ESCROW_ADDRESS,
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

  // Third wave: read active rental for each fighterB via the explicit
  // `getActiveRental(uint256) -> ActiveRental` view (NOT the public
  // mapping auto-getter `activeRental` which reverts on direct external
  // call — confirmed via raw eth_call returning "execution reverted").
  // Returns a single tuple ActiveRental{ renter, startedAt, expiresAt,
  // paid }; zero-address renter means no active rental.
  const rentalReads = useReadContracts({
    allowFailure: true,
    contracts:
      battleReads.data && RENTAL_ESCROW_ADDRESS !== ""
        ? battleReads.data.map((_, i) => {
            const battle =
              battleReads.data?.[i].status === "success"
                ? (battleReads.data[i].result as unknown)
                : null;
            const fighterB = Array.isArray(battle)
              ? (battle[1] as bigint)
              : (battle as { fighterB?: bigint } | null)?.fighterB;
            return {
              address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
              abi: RENTAL_ESCROW_ABI,
              functionName: "getActiveRental",
              args: [fighterB ?? 0n],
            };
          })
        : [],
    query: { enabled: !!battleReads.data && RENTAL_ESCROW_ADDRESS !== "" },
  });

  const incoming: PendingChallenge[] = [];
  const outgoing: PendingChallenge[] = [];

  // TEMP diagnostic v28.1 — per-battle audit to spot which read is
  // wired wrong. BigInt-safe (uint64 / uint256 fields → strings).
  // Remove once root cause identified (next commit).
  if (
    typeof window !== "undefined" &&
    user &&
    battleReads.data &&
    rentalReads.data &&
    ownerReads.data
  ) {
    const safe = (v: unknown): unknown => {
      if (typeof v === "bigint") return v.toString();
      if (Array.isArray(v)) return v.map(safe);
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[k] = safe(val);
        }
        return out;
      }
      return v;
    };
    const nowSec = Math.floor(Date.now() / 1000);
    const luUser = user.toLowerCase();
    const audit = battleIds.map((id, i) => {
      const battleRaw = battleReads.data?.[i].status === "success"
        ? (battleReads.data[i].result as unknown)
        : null;
      const rentalRaw = rentalReads.data?.[i].status === "success"
        ? (rentalReads.data[i].result as unknown)
        : null;
      const ownerRaw = ownerReads.data?.[i].status === "success"
        ? (ownerReads.data[i].result as unknown)
        : null;
      const fighterA = Array.isArray(battleRaw)
        ? (battleRaw[0] as bigint)
        : (battleRaw as { fighterA?: bigint } | null)?.fighterA;
      const fighterB = Array.isArray(battleRaw)
        ? (battleRaw[1] as bigint)
        : (battleRaw as { fighterB?: bigint } | null)?.fighterB;
      const status = Array.isArray(battleRaw)
        ? (battleRaw[7] as number)
        : (battleRaw as { status?: number } | null)?.status;
      const renter = Array.isArray(rentalRaw)
        ? (rentalRaw[0] as `0x${string}` | undefined)
        : (rentalRaw as { renter?: `0x${string}` } | null)?.renter;
      const expiresAt = Array.isArray(rentalRaw)
        ? (rentalRaw[2] as bigint | undefined)
        : (rentalRaw as { expiresAt?: bigint } | null)?.expiresAt;
      const owner = ownerRaw as `0x${string}` | null;
      const leaseActive = !!expiresAt && Number(expiresAt) > nowSec;
      const matchesByOwner = !!owner && owner.toLowerCase() === luUser;
      const matchesByRenter =
        !!renter && renter.toLowerCase() === luUser && leaseActive;
      return {
        battleId: String(id),
        fighterA: fighterA !== undefined ? String(fighterA) : "?",
        fighterB: fighterB !== undefined ? String(fighterB) : "?",
        status,
        ownerOfB: owner,
        rentalRenter: renter,
        rentalExpiresAt: expiresAt !== undefined ? String(expiresAt) : "?",
        leaseActive,
        matchesByOwner,
        matchesByRenter,
        finalMatch: matchesByOwner || matchesByRenter,
      };
    });
    // Only surface battles where SOMETHING is interesting: status==Pending,
    // OR there's a non-zero rental, OR any match fires.
    const interesting = audit.filter(
      (a) =>
        a.status === STATUS_PENDING ||
        (a.rentalRenter &&
          a.rentalRenter !== "0x0000000000000000000000000000000000000000") ||
        a.finalMatch,
    );
    const summaryStr = JSON.stringify(safe(interesting));
    const dbg = (window as unknown as { __yapPendingChallengesDebug?: string })
      .__yapPendingChallengesDebug;
    if (dbg !== summaryStr) {
      (
        window as unknown as { __yapPendingChallengesDebug: string }
      ).__yapPendingChallengesDebug = summaryStr;
      console.log(
        "[usePendingChallenges audit]",
        "nowSec=" + nowSec,
        "user=" + user,
        "interestingBattles=",
        safe(interesting),
      );
    }
  }

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

      // Active-rental renter, if any. Tuple `(renter, startedAt, expiresAt, paid)`.
      // Zero renter address (or expired lease) means no active rental.
      const rentalRes = rentalReads.data?.[i];
      let fighterBRenter: `0x${string}` | null = null;
      if (rentalRes?.status === "success") {
        const r = rentalRes.result as unknown;
        const renterAddr = Array.isArray(r)
          ? (r[0] as `0x${string}`)
          : (r as { renter?: `0x${string}` } | null)?.renter ?? null;
        const rentalExpiresAt = Array.isArray(r)
          ? Number(r[2] as bigint) * 1000
          : Number((r as { expiresAt?: bigint } | null)?.expiresAt ?? 0n) * 1000;
        if (
          renterAddr &&
          renterAddr !== "0x0000000000000000000000000000000000000000" &&
          rentalExpiresAt > Date.now()
        ) {
          fighterBRenter = renterAddr;
        }
      }

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
      // "I am the defender" — match if EITHER:
      //   1. I own fighterB on-chain (default ownership case), OR
      //   2. fighterB is in an active rental WHERE I am the renter.
      //      During an active lease the renter holds operational control;
      //      original owner cannot accept since fighterB is in
      //      RentalEscrow custody. Renter must see + decide on incoming
      //      challenges or they auto-expire.
      const ownsAsDefender = !!fighterBOwner && fighterBOwner.toLowerCase() === lu;
      const rentsAsDefender = !!fighterBRenter && fighterBRenter.toLowerCase() === lu;
      if (ownsAsDefender || rentsAsDefender) {
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
