"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";

// Convenience wrapper composing useWriteContract + useWaitForTransactionReceipt
// so call sites get a single `{ write, hash, receipt, isPending, isConfirming,
// isSuccess, error, reset }` surface.
export function useTx() {
  const {
    writeContract,
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const receipt = useWaitForTransactionReceipt({ hash });

  return {
    writeContract,
    writeContractAsync,
    hash,
    receipt: receipt.data,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: writeError ?? receipt.error ?? null,
    reset,
  };
}
