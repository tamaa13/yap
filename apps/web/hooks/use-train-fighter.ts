"use client";

import { useCallback, useState } from "react";
import { parseEventLogs } from "viem";
import type { Address } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import {
  FIGHTER_TRAINER_ABI,
  FIGHTER_TRAINER_ADDRESS,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";

export interface TrainFighterArgs {
  tokenId: number;
  owner: Address;
  /** Full new style seed (combine old + new lines client-side). */
  styleSeed: string;
  baseModel?: string;
  /** Optional metadata refresh — defaults preserve previous values. */
  name?: string;
  archetype: string;
  avatar?: number;
}

export interface TrainSteps {
  seedRoot: string;
  fineTuneTaskId: string | null;
  fineTuneProvider: string | null;
  weightsRoot: string;
}

export interface TrainResult {
  tokenId: number;
  sessionNumber: number;
  txHash: string;
  rootHash: string;
  explorerUrl: string;
  steps: TrainSteps;
}

export type TrainPhase =
  | "idle"
  | "queued"
  | "uploading-seed"
  | "training"
  | "retrying"
  | "decrypting"
  | "encrypting-weights"
  | "uploading-weights"
  | "signing"
  | "minting"
  | "done"
  | "error";

interface PreparePayload {
  mint: {
    to: `0x${string}`;
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
  };
  commit: {
    weightsRoot: string;
  };
  steps: TrainSteps & {
    fineTuneBypassed: boolean;
  };
}

type ServerStatus =
  | "queued"
  | "uploading-seed"
  | "training"
  | "decrypting"
  | "encrypting-weights"
  | "uploading-weights"
  | "ready"
  | "failed";

interface JobShape {
  status: ServerStatus;
  result?: PreparePayload;
  error?: string;
}

/**
 * Continuous-learning hook. Mirrors useMintFighter's async pattern but
 * dispatches FighterTrainer.train(...) instead of YapFighter.mint(...).
 * Each call adds a new training session to the fighter's on-chain
 * history without minting a new token.
 */
export function useTrainFighter() {
  const [phase, setPhase] = useState<TrainPhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TrainResult | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const write = useCallback(
    async (args: TrainFighterArgs): Promise<TrainResult> => {
      setError(null);
      setResult(null);

      if (!walletClient) throw new Error("Wallet not connected");
      if (!publicClient) throw new Error("RPC client not ready");
      if (FIGHTER_TRAINER_ADDRESS === "") {
        throw new Error("FighterTrainer address not configured");
      }

      try {
        // 1. Open async train job (server runs full prepare pipeline).
        setPhase("queued");
        const startRes = await fetch(
          `/api/fighters/${args.tokenId}/train/start`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              owner: args.owner,
              name: args.name ?? "",
              archetype: args.archetype,
              avatar: args.avatar ?? 0,
              styleSeed: args.styleSeed,
              baseModel: args.baseModel,
            }),
          },
        );
        if (!startRes.ok) {
          const body = await startRes.json().catch(() => ({ error: startRes.statusText }));
          throw new Error(body.error ?? `Failed to enqueue train (${startRes.status})`);
        }
        const { jobId } = (await startRes.json()) as { jobId: string };

        const prep = await pollJob(jobId, (status) => {
          // Map 1:1 — TrainPhase shares the server status names.
          if (status === "ready") setPhase("signing");
          else setPhase(status as TrainPhase);
        });

        // 2. User signs FighterTrainer.train(...) — caller proves
        //    ownership, contract emits FighterTrained event with
        //    sessionNumber for the on-chain history.
        setPhase("signing");
        const txHash = await walletClient.writeContract({
          address: FIGHTER_TRAINER_ADDRESS as `0x${string}`,
          abi: FIGHTER_TRAINER_ABI,
          functionName: "train",
          args: [
            BigInt(args.tokenId),
            prep.mint.encryptedURI,
            prep.mint.metadataHash,
            prep.mint.sealedKey as `0x${string}`,
            prep.steps.fineTuneTaskId ?? "",
            prep.steps.fineTuneProvider ?? "",
            "0x" as `0x${string}`, // attestationSig — placeholder; surfaces in event for verifier
          ],
        });

        // 3. Wait for receipt + read sessionNumber from event.
        setPhase("minting");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        if (receipt.status !== "success") throw new Error("train tx reverted");

        const events = parseEventLogs({
          abi: FIGHTER_TRAINER_ABI,
          logs: receipt.logs,
          eventName: "FighterTrained",
        });
        type TrainedArgs = {
          tokenId: bigint;
          sessionNumber: bigint;
        };
        const ev = events.find(
          (e) => typeof (e as { args?: unknown }).args === "object",
        ) as { args: TrainedArgs } | undefined;
        if (!ev) throw new Error("FighterTrained event missing");

        const payload: TrainResult = {
          tokenId: Number(ev.args.tokenId),
          sessionNumber: Number(ev.args.sessionNumber),
          txHash,
          rootHash: prep.commit.weightsRoot,
          explorerUrl: `${activeChain.blockExplorers.default.url}/tx/${txHash}`,
          steps: prep.steps,
        };
        setResult(payload);
        setPhase("done");
        return payload;
      } catch (e) {
        const err = e instanceof Error ? e : new Error("train failed");
        setError(err);
        setPhase("error");
        throw err;
      }
    },
    [walletClient, publicClient],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  return { phase, error, result, write, reset };
}

async function pollJob(
  jobId: string,
  onStatus: (s: ServerStatus) => void,
): Promise<PreparePayload> {
  const deadline = Date.now() + 12 * 60_000;
  let lastStatus: ServerStatus | "" = "";
  while (Date.now() < deadline) {
    const res = await fetch(`/api/mint/status/${jobId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `train job lookup failed (${res.status})`);
    }
    const job = (await res.json()) as JobShape;
    if (job.status !== lastStatus) {
      onStatus(job.status);
      lastStatus = job.status;
    }
    if (job.status === "ready" && job.result) return job.result;
    if (job.status === "failed") {
      throw new Error(job.error ?? "train job failed");
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error("train job timed out (>12 min); check server logs");
}
