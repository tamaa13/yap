"use client";

import { useCallback } from "react";
import { encodeAbiParameters, type Address } from "viem";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { useTx } from "./use-tx";

export interface AuthorizeRentalArgs {
  tokenId: number | bigint;
  executor: Address;
  expiresAt: number; // unix seconds
  maxUses: number; // 0 = unlimited
}

export function useAuthorizeRental() {
  const tx = useTx();

  const write = useCallback(
    (args: AuthorizeRentalArgs) => {
      if (FIGHTER_INFT_ADDRESS === "") {
        throw new Error("YapFighter address not configured");
      }
      // Encode permissions as (uint64 expiresAt, uint32 maxUses). Verifier +
      // consumers decode with matching types.
      const permissions = encodeAbiParameters(
        [
          { name: "expiresAt", type: "uint64" },
          { name: "maxUses", type: "uint32" },
        ],
        [BigInt(args.expiresAt), args.maxUses],
      );
      return tx.writeContractAsync({
        address: FIGHTER_INFT_ADDRESS as `0x${string}`,
        abi: FIGHTER_INFT_ABI,
        functionName: "authorizeUsage",
        args: [BigInt(args.tokenId), args.executor, permissions],
      });
    },
    [tx],
  );

  return { ...tx, write };
}
