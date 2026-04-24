"use client";

import { useCallback } from "react";
import { BATTLE_ESCROW_ABI, BATTLE_ESCROW_ADDRESS } from "@/lib/contracts";
import { parseBattleId } from "@/lib/on-chain";
import { useTx } from "./use-tx";

export function useClaimPayout() {
  const tx = useTx();

  const write = useCallback(
    (uiBattleId: string) => {
      if (BATTLE_ESCROW_ADDRESS === "") {
        throw new Error("BattleEscrow address not configured");
      }
      const id = parseBattleId(uiBattleId);
      if (id === null) throw new Error(`Invalid battleId: ${uiBattleId}`);
      return tx.writeContractAsync({
        address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functionName: "claimPayout",
        args: [id],
      });
    },
    [tx],
  );

  return { ...tx, write };
}
