"use client";

import { useCallback, useState } from "react";
import { parseEventLogs, stringToHex } from "viem";
import type { Address } from "viem";
import { useReadContract, useWalletClient } from "wagmi";
import { usePublicClient } from "wagmi";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/chains";

/** Full TEE attestation bundle from /api/mint/score's live path. Required
 *  by both the v4 6-arg mint() overload (seedHash) AND the subsequent
 *  recordMintScores tx that writes the 5 scores on-chain. Sourced from
 *  the score response — every field except `scores` is opaque bytes the
 *  contract re-verifies against the registered scoreOracleKey. */
export interface PersonaAttestation {
  scores: {
    logos: number;
    rhetoric: number;
    aggression: number;
    range: number;
    concreteness: number;
  };
  seedHash: `0x${string}`;
  responseBodyHex: `0x${string}`;
  contentOffset: number;
  /** ASCII canonical text the TEE echoed. Encoded to hex bytes before
   *  passing as `bytes signedText` calldata to recordMintScores. */
  signedText: string;
  teeSignature: `0x${string}`;
}

export interface MintFighterArgs {
  owner: Address;
  name: string;
  archetype: string;
  avatar?: number;
  styleSeed: string;
  /** uint8 archetype index 0-5 (per ARCHETYPE_INDEX); the v4 6-arg
   *  mint() overload requires this on-chain. */
  archetypeIndex: number;
  /** Full TEE attestation. seedHash is used at mint() time (binds the
   *  seed to the token), the rest is replayed in recordMintScores to
   *  commit the 5 scores. */
  attestation: PersonaAttestation;
}

export interface MintSteps {
  seedRoot: string;
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
  | "encrypting"
  | "signing"
  | "minting"
  | "scoring-commit"
  | "committing"
  | "done"
  | "error";

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
  };
  steps: MintSteps;
}

export function useMintFighter() {
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<MintResult | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Current mintFee from contract. Reactive — updates if admin changes it.
  const { data: mintFee } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "mintFee",
    query: { enabled: FIGHTER_INFT_ADDRESS !== "" },
  });

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
        // 1. Open mint job. /start returns the jobId; pipeline finishes
        //    in ~5 s post-pivot (no fine-tune). Same async polling shape
        //    is preserved so the UI's status indicator works unchanged.
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
          switch (status) {
            case "uploading-seed":
              setPhase("seed");
              break;
            case "encrypting":
            case "uploading-encrypted":
              setPhase("encrypting");
              break;
          }
        });

        // 2. User signs the mint transaction from their own wallet.
        setPhase("signing");
        const fee = (mintFee as bigint | undefined) ?? 0n;
        // 6-arg v4 overload — viem disambiguates the two mint() entries
        // in the ABI by args.length, so plain functionName: "mint" with
        // a 6-element args array selects mint(address,string,bytes32,
        // bytes,uint8,bytes32) (selector 0x6b1478f8). The 4-arg overload
        // (selector 0xf693ffaf) is still in the ABI but YapFighter.sol:185
        // reverts it with MintNotSupported.
        const txHash = await walletClient.writeContract({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          functionName: "mint",
          args: [
            prep.mint.to,
            prep.mint.encryptedURI,
            prep.mint.metadataHash,
            prep.mint.sealedKey as `0x${string}`,
            args.archetypeIndex,
            args.attestation.seedHash,
          ],
          value: fee,
        });

        // 3. Wait for receipt + parse Minted event for tokenId.
        //
        // viem's defaults give up well before Galileo testnet propagates
        // a fresh tx. Override with a longer poll window (5 min, 4-second
        // interval) so we don't false-alarm the user.
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

        // 4. Commit the TEE-attested persona scores on-chain via
        //    recordMintScores. Without this, the fighter exists but
        //    traits stay [0,0,0,0,0] and isScored=false — abilities
        //    can never unlock. The contract re-verifies the same
        //    three checks the score endpoint already passed (ECDSA
        //    recovery to scoreOracleKey, sha256(responseBody),
        //    canonical reconstruction at offset). signedText is the
        //    ASCII canonical line the TEE echoed — encoded to
        //    UTF-8 hex bytes for the `bytes` calldata.
        setPhase("scoring-commit");
        const { scores, seedHash, responseBodyHex, contentOffset, signedText, teeSignature } =
          args.attestation;
        const scoreTx = await walletClient.writeContract({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          functionName: "recordMintScores",
          args: [
            BigInt(tokenId),
            [
              scores.logos,
              scores.rhetoric,
              scores.aggression,
              scores.range,
              scores.concreteness,
            ],
            seedHash,
            responseBodyHex,
            BigInt(contentOffset),
            stringToHex(signedText),
            teeSignature,
          ],
        });
        const scoreReceipt = await publicClient.waitForTransactionReceipt({
          hash: scoreTx,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        if (scoreReceipt.status !== "success") {
          throw new Error("recordMintScores tx reverted");
        }

        // 5. Commit plaintext metadata (name/archetype/signatureStyle) server-side.
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
        const err = e instanceof Error ? e : new Error("mint failed");
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
    | "encrypting"
    | "uploading-encrypted"
    | "ready"
    | "failed";
  step?: string;
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
  const pollIntervalMs = 1_500;
  // 2-minute hard cap — generous buffer above the ~5 s happy-path
  // post-pivot, surfacing genuine 0G Storage stalls without polling forever.
  const deadline = Date.now() + 2 * 60_000;
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
  throw new Error("mint job timed out (>2 min); check 0G Storage indexer");
}
