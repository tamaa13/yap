"use client";

import { useCallback } from "react";
import { parseEther } from "viem";
import { BATTLE_ESCROW_ABI, BATTLE_ESCROW_ADDRESS } from "@/lib/contracts";
import { useTx } from "./use-tx";

export interface CreateBattleArgs {
  fighterA: number | bigint;
  fighterB: number | bigint;
  topic: string;
  maxRounds: number;
  /** Challenger's stake in 0G, recorded as a pari-mutuel bet on side A.
   *  Required to be > 0 (contract enforces). Refunded on Cancelled. */
  stakeEth: string;
}

export function useCreateBattle() {
  const tx = useTx();

  const write = useCallback(
    (args: CreateBattleArgs) => {
      if (BATTLE_ESCROW_ADDRESS === "") {
        throw new Error("BattleEscrow address not configured");
      }
      const value = parseEther(args.stakeEth);
      if (value <= 0n) throw new Error("Stake must be greater than 0");
      return tx.writeContractAsync({
        address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functionName: "createBattle",
        args: [
          BigInt(args.fighterA),
          BigInt(args.fighterB),
          args.topic,
          args.maxRounds,
        ],
        value,
      });
    },
    [tx],
  );

  return { ...tx, write };
}
