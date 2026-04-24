"use client";

import { useCallback } from "react";
import { parseEther } from "viem";
import { BATTLE_ESCROW_ABI, BATTLE_ESCROW_ADDRESS } from "@/lib/contracts";
import { parseBattleId } from "@/lib/on-chain";
import { useTx } from "./use-tx";

export interface PlaceBetArgs {
  battleId: string; // UI id, e.g. "b-0001"
  side: "a" | "b";
  amountOG: number; // 0G units (not wei)
}

export function usePlaceBet() {
  const tx = useTx();

  const write = useCallback(
    (args: PlaceBetArgs) => {
      if (BATTLE_ESCROW_ADDRESS === "") {
        throw new Error("BattleEscrow address not configured");
      }
      const onChainId = parseBattleId(args.battleId);
      if (onChainId === null) throw new Error(`Invalid battleId: ${args.battleId}`);
      const amountWei = parseEther(args.amountOG.toString());
      return tx.writeContractAsync({
        address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functionName: "placeBet",
        args: [onChainId, args.side === "a" ? 0 : 1, amountWei],
        value: amountWei,
      });
    },
    [tx],
  );

  return { ...tx, write };
}
