"use client";

// Surfaces the 0G DA epoch this battle's verdict was anchored at.
//
// Two read paths, merged into a single hook result:
//
//   1. View: `battleDAEpoch(battleId)` — works for battles already anchored
//      before the result page mounted. Returns 0 when no anchor has happened
//      (pre-redeploy battles, or settle tx still in flight). Polled lightly.
//   2. Event: `BattleDAAnchored(battleId indexed, epoch)` — fires when the
//      submitVerdict tx lands and the anchoring side-call runs. Captures the
//      tx hash so the badge can link to the chain explorer.
//
// Returns null when neither path produces a non-zero epoch. The result
// page renders the DA badge only when this hook returns a value, so the
// badge stays dark for all pre-redeploy battles (intended migration path).

import { useState } from "react";
import { useReadContract, useWatchContractEvent } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";

export interface BattleDAEpoch {
  epoch: number;
  /** Tx that emitted BattleDAAnchored. Null when the epoch came from the
   *  view (event arrived before mount or was missed by the watcher). */
  txHash: `0x${string}` | null;
}

interface EventLogShape {
  args?: { battleId?: bigint; epoch?: bigint };
  transactionHash?: `0x${string}`;
}

export function useBattleDAEpoch(
  battleId: number | null,
): BattleDAEpoch | null {
  const enabled = battleId !== null && BATTLE_ESCROW_ADDRESS !== "";
  const [observed, setObserved] = useState<BattleDAEpoch | null>(null);

  const { data: viewEpoch } = useReadContract({
    address: enabled ? (BATTLE_ESCROW_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_ESCROW_ABI,
    functionName: "battleDAEpoch",
    args: enabled ? [BigInt(battleId as number)] : undefined,
    query: { enabled, refetchInterval: 15_000 },
  });

  useWatchContractEvent({
    address: enabled ? (BATTLE_ESCROW_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleDAAnchored",
    enabled,
    onLogs(logs) {
      for (const log of logs as unknown as EventLogShape[]) {
        if (
          log.args?.battleId !== undefined &&
          log.args.epoch !== undefined &&
          Number(log.args.battleId) === battleId
        ) {
          setObserved({
            epoch: Number(log.args.epoch),
            txHash: log.transactionHash ?? null,
          });
          return;
        }
      }
    },
  });

  if (observed) return observed;
  const epochNum = viewEpoch ? Number(viewEpoch as bigint) : 0;
  if (epochNum > 0) return { epoch: epochNum, txHash: null };
  return null;
}
