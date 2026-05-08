"use client";

import { useCallback, useRef, useState } from "react";
import { parseEventLogs } from "viem";
import type { Address } from "viem";
import { useReadContract, useWalletClient } from "wagmi";
import { usePublicClient } from "wagmi";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/chains";

export interface MintFighterArgs {
  owner: Address;
  name: string;
  archetype: string;
  avatar?: number;
  styleSeed: string; // JSONL or freeform text
  baseModel?: string;
}

export interface MintSteps {
  seedRoot: string;
  fineTuneTaskId: string | null;
  fineTuneProvider: string | null;
  fineTuneBypassed: boolean;
  weightsRoot: string;
}

export interface MintResult {
  tokenId: number;
  txHash: string;
  rootHash: string;
  explorerUrl: string;
  steps: MintSteps;
}

export type MintPhase =
  | "idle"
  | "seed"
  | "training"
  | "encrypting"
  | "signing"
  | "minting"
  | "committing"
  | "done"
  | "error";

// Prepare-phase timeline. The server runs seed upload → fine-tune → encrypt +
// weight upload synchronously; we advance the spinner through stages using
// elapsed time so users see movement during the multi-minute fine-tune.
const PREPARE_TIMELINE: Array<[MintPhase, number]> = [
  ["seed", 0],
  ["training", 5_000],
  ["encrypting", 4 * 60 * 1000],
];

interface PrepareResponse {
  mint: {
    to: `0x${string}`;
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
  };
  commit: {
    owner: `0x${string}`;
    name: string;
    archetype: string;
    avatar: number;
    seedRoot: string;
    weightsRoot: string;
    signatureStyle: string[];
    fineTuneBypassed: boolean;
  };
  steps: MintSteps;
}

export function useMintFighter() {
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<MintResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Current mintFee from contract. Reactive — updates if admin changes it.
  const { data: mintFee } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "mintFee",
    query: { enabled: FIGHTER_INFT_ADDRESS !== "" },
  });

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const write = useCallback(
    async (args: MintFighterArgs): Promise<MintResult> => {
      setError(null);
      setResult(null);

      if (!walletClient) throw new Error("Wallet not connected");
      if (!publicClient) throw new Error("RPC client not ready");
      if (FIGHTER_INFT_ADDRESS === "") {
        throw new Error("YapFighter address not configured");
      }

      setPhase("seed");

      try {
        // 1. Open an async mint job. /start returns in <2 s with a jobId;
        //    the 9-minute fine-tune runs in background. Poll /status until
        //    the job carries a `result`. Server-driven status drives the
        //    phase indicator instead of the wall-clock timeline we used to
        //    fake during the synchronous request.
        const startRes = await fetch("/api/mint/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!startRes.ok) {
          const body = await startRes.json().catch(() => ({ error: startRes.statusText }));
          throw new Error(body.error ?? `Failed to enqueue mint (${startRes.status})`);
        }
        const { jobId } = (await startRes.json()) as { jobId: string };

        const prep = await pollMintJob(jobId, (status) => {
          // Map server status → the legacy MintPhase enum so the existing
          // step indicator UI works without changes.
          switch (status) {
            case "uploading-seed":
              setPhase("seed");
              break;
            case "training":
            // "retrying" lives in the same conceptual slot as training —
            // the server picked a fresh provider after the previous one
            // timed out. UI step label updates via the job.step field
            // surfaced by /status, so we keep the spinner anchored on
            // the training stage rather than bouncing back.
            case "retrying":
              setPhase("training");
              break;
            case "decrypting":
            case "encrypting-weights":
              setPhase("encrypting");
              break;
            case "uploading-weights":
              setPhase("encrypting");
              break;
          }
        });
        stopTimer();

        // 2. User signs the mint transaction from their own wallet.
        setPhase("signing");
        const fee = (mintFee as bigint | undefined) ?? 0n;
        const txHash = await walletClient.writeContract({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          functionName: "mint",
          args: [
            prep.mint.to,
            prep.mint.encryptedURI,
            prep.mint.metadataHash,
            prep.mint.sealedKey as `0x${string}`,
          ],
          value: fee,
        });

        // 3. Wait for receipt + parse Minted event for tokenId.
        //
        // viem's defaults (~6 retries, 200 ms apart) give up well before
        // Galileo testnet propagates a fresh tx — the receipt then surfaces
        // as "transaction not found" even though the mint has succeeded
        // on-chain. Override with a longer poll window (5 min, 4-second
        // interval, 60 retries on transient lookup failures) so we don't
        // false-alarm the user.
        setPhase("minting");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        if (receipt.status !== "success") throw new Error("Mint tx reverted");

        const events = parseEventLogs({
          abi: FIGHTER_INFT_ABI,
          logs: receipt.logs,
          eventName: "Minted",
        });
        type MintedArgs = { tokenId: bigint; to: `0x${string}` };
        const firstWithArgs = events.find((e) => {
          return typeof (e as { args?: unknown }).args === "object";
        }) as { args: MintedArgs } | undefined;
        if (!firstWithArgs) throw new Error("Minted event missing from receipt");
        const tokenId = Number(firstWithArgs.args.tokenId);

        // 4. Commit plaintext metadata (name/archetype/signatureStyle) server-side.
        setPhase("committing");
        const commitRes = await fetch("/api/fighters/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            txHash,
            owner: prep.commit.owner,
            name: prep.commit.name,
            archetype: prep.commit.archetype,
            avatar: prep.commit.avatar,
            seedRoot: prep.commit.seedRoot,
            weightsRoot: prep.commit.weightsRoot,
            signatureStyle: prep.commit.signatureStyle,
          }),
        });
        if (!commitRes.ok) {
          // Non-fatal: the mint is already on-chain. The user can still view
          // their fighter (with fallback name/archetype). Surface as a warning.
          const body = await commitRes.json().catch(() => ({ error: commitRes.statusText }));
          console.warn("[mint] commit failed", body.error);
        }

        const payload: MintResult = {
          tokenId,
          txHash,
          rootHash: prep.commit.weightsRoot,
          explorerUrl: `${activeChain.blockExplorers.default.url}/tx/${txHash}`,
          steps: prep.steps,
        };
        setResult(payload);
        setPhase("done");
        return payload;
      } catch (e) {
        stopTimer();
        const err = e instanceof Error ? e : new Error("mint failed");
        setError(err);
        setPhase("error");
        throw err;
      }
    },
    [walletClient, publicClient, mintFee],
  );

  const reset = useCallback(() => {
    stopTimer();
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  return {
    phase,
    error,
    result,
    write,
    reset,
    mintFee: mintFee as bigint | undefined,
  };
}

interface MintJobShape {
  status:
    | "queued"
    | "uploading-seed"
    | "training"
    | "retrying"
    | "decrypting"
    | "encrypting-weights"
    | "uploading-weights"
    | "ready"
    | "failed";
  step?: string;
  attempt?: number;
  lastRetryReason?: string;
  result?: PrepareResponse;
  error?: string;
}

/**
 * Poll /api/mint/status/<id> until the job is `ready` or `failed`.
 * Resolves with the prepare payload (mint params + commit metadata)
 * the caller then signs on-chain. Notifies the caller of intermediate
 * status changes via `onStatus` so the UI can advance its step indicator.
 */
async function pollMintJob(
  jobId: string,
  onStatus: (status: MintJobShape["status"]) => void,
): Promise<PrepareResponse> {
  const pollIntervalMs = 3_000;
  // 12-minute hard cap — comfortably above the 9-minute happy-path
  // mint while still surfacing genuine stalls instead of polling forever.
  const deadline = Date.now() + 12 * 60_000;
  let lastStatus: MintJobShape["status"] | "" = "";
  while (Date.now() < deadline) {
    const res = await fetch(`/api/mint/status/${jobId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `mint job lookup failed (${res.status})`);
    }
    const job = (await res.json()) as MintJobShape;
    if (job.status !== lastStatus) {
      onStatus(job.status);
      lastStatus = job.status;
    }
    if (job.status === "ready" && job.result) return job.result;
    if (job.status === "failed") {
      throw new Error(job.error ?? "mint job failed");
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("mint job timed out (>12 min); check server logs");
}
