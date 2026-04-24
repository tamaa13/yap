"use client";

import { useCallback } from "react";
import { parseEther } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { BATTLE_ESCROW_ABI, BATTLE_ESCROW_ADDRESS } from "@/lib/contracts";

export function useAcceptBattle() {
  const accept = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: accept.data });

  const write = useCallback(
    async (
      battleId: number | bigint,
      opts?: { stakeEth?: string },
    ) => {
      if (!BATTLE_ESCROW_ADDRESS) {
        throw new Error("BattleEscrow not configured");
      }
      const value =
        opts?.stakeEth && opts.stakeEth.trim() !== ""
          ? parseEther(opts.stakeEth)
          : 0n;
      return accept.writeContractAsync({
        address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functionName: "acceptBattle",
        args: [BigInt(battleId)],
        value,
      });
    },
    [accept],
  );

  return {
    error: accept.error,
    isPending: accept.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: accept.data,
    write,
  };
}

export function useDeclineBattle() {
  const decline = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: decline.data });

  const write = useCallback(
    async (battleId: number | bigint) => {
      if (!BATTLE_ESCROW_ADDRESS) {
        throw new Error("BattleEscrow not configured");
      }
      return decline.writeContractAsync({
        address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functionName: "declineBattle",
        args: [BigInt(battleId)],
      });
    },
    [decline],
  );

  return {
    error: decline.error,
    isPending: decline.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: decline.data,
    write,
  };
}
