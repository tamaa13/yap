"use client";

import { useCallback, useState } from "react";
import { encodeAbiParameters, keccak256, parseEventLogs } from "viem";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import {
  MOMENT_INFT_ABI,
  MOMENT_INFT_ADDRESS,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";

export interface MintMomentArgs {
  battleId: number;
  roundNo: number;
  side: "a" | "b";
}

export interface MintMomentResult {
  tokenId: number;
  txHash: `0x${string}`;
  encryptedURI: string;
  explorerUrl: string;
}

export type MintMomentPhase =
  | "idle"
  | "preparing"
  | "signing"
  | "minting"
  | "done"
  | "error";

interface PrepareResponse {
  mint: {
    battleId: number;
    roundNo: number;
    side: number;
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
    provenanceHash: `0x${string}`;
  };
  context: {
    fighterTokenId: number;
    transcriptPreview: string;
    transcriptByteLength: number;
  };
}

export function useMintMoment() {
  const [phase, setPhase] = useState<MintMomentPhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<MintMomentResult | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { data: mintFee } = useReadContract({
    address: MOMENT_INFT_ADDRESS as `0x${string}`,
    abi: MOMENT_INFT_ABI,
    functionName: "mintFee",
    query: { enabled: MOMENT_INFT_ADDRESS !== "" },
  });

  const write = useCallback(
    async (args: MintMomentArgs): Promise<MintMomentResult> => {
      setError(null);
      setResult(null);
      setPhase("preparing");

      try {
        if (!walletClient) throw new Error("Wallet not connected");
        if (!publicClient) throw new Error("RPC client not ready");
        if (MOMENT_INFT_ADDRESS === "") {
          throw new Error("MomentINFT not configured for this network");
        }

        const prepRes = await fetch("/api/moments/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            battleId: args.battleId,
            roundNo: args.roundNo,
            side: args.side,
          }),
        });
        if (!prepRes.ok) {
          const body = await prepRes
            .json()
            .catch(() => ({ error: prepRes.statusText }));
          throw new Error(body.error ?? `prepare failed (${prepRes.status})`);
        }
        const prep = (await prepRes.json()) as PrepareResponse;

        setPhase("signing");
        const fee = (mintFee as bigint | undefined) ?? 0n;
        const txHash = await walletClient.writeContract({
          address: MOMENT_INFT_ADDRESS as `0x${string}`,
          abi: MOMENT_INFT_ABI,
          functionName: "mintMoment",
          args: [
            BigInt(prep.mint.battleId),
            prep.mint.roundNo,
            prep.mint.side,
            prep.mint.encryptedURI,
            prep.mint.metadataHash,
            prep.mint.sealedKey as `0x${string}`,
            prep.mint.provenanceHash,
          ],
          value: fee,
        });

        setPhase("minting");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        if (receipt.status !== "success") throw new Error("mint tx reverted");

        const events = parseEventLogs({
          abi: MOMENT_INFT_ABI,
          logs: receipt.logs,
          eventName: "MomentMinted",
        });
        type MomentMintedArgs = { tokenId: bigint };
        const ev = events.find(
          (e) => typeof (e as { args?: unknown }).args === "object",
        ) as { args: MomentMintedArgs } | undefined;
        if (!ev) throw new Error("MomentMinted event missing from receipt");
        const tokenId = Number(ev.args.tokenId);

        const payload: MintMomentResult = {
          tokenId,
          txHash,
          encryptedURI: prep.mint.encryptedURI,
          explorerUrl: `${activeChain.blockExplorers.default.url}/tx/${txHash}`,
        };
        setResult(payload);
        setPhase("done");
        return payload;
      } catch (e) {
        const err = e instanceof Error ? e : new Error("mint moment failed");
        setError(err);
        setPhase("error");
        throw err;
      }
    },
    [walletClient, publicClient, mintFee],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  return {
    write,
    reset,
    phase,
    error,
    result,
    mintFee: mintFee as bigint | undefined,
  };
}

/** Read whether a (battleId, roundNo, side) tuple has already been minted.
 *  Contract dedup key: keccak256(abi.encode(uint256, uint16, uint8)). */
export function useMomentClaimed(args: MintMomentArgs | null) {
  // Compute the lookup key client-side. Contract uses
  //   keccak256(abi.encode(battleId, roundNo, uint8(side)))
  // mapped through `momentClaimed(bytes32) → bool`.
  const enabled = MOMENT_INFT_ADDRESS !== "" && args !== null;
  // viem's keccak256 over encoded data; cheaper to do this in the hook
  // than ship a server round-trip. Using ethers' AbiCoder via dynamic
  // import would bloat client bundle — viem's encodeAbiParameters is
  // already in scope via wagmi.
  const dedupHash = enabled ? computeMomentDedupHash(args) : null;

  const { data, isLoading } = useReadContract({
    address: MOMENT_INFT_ADDRESS as `0x${string}`,
    abi: MOMENT_INFT_ABI,
    functionName: "momentClaimed",
    args: enabled ? [dedupHash as `0x${string}`] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });

  return {
    claimed: typeof data === "boolean" ? data : null,
    isLoading,
  };
}

function computeMomentDedupHash(args: MintMomentArgs): `0x${string}` {
  const sideNum = args.side === "a" ? 0 : 1;
  return keccak256(
    encodeAbiParameters(
      [
        { name: "battleId", type: "uint256" },
        { name: "roundNo", type: "uint16" },
        { name: "side", type: "uint8" },
      ],
      [BigInt(args.battleId), args.roundNo, sideNum],
    ),
  );
}
