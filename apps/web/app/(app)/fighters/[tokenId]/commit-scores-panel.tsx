"use client";

// Retroactive persona-score commit for fighters minted before the
// recordMintScores wiring landed in the mint flow (fix 06c6c43).
// Pre-fix the FE called mint() but never recordMintScores, so the
// fighter exists on-chain with traits [0,0,0,0,0] and isScored=false.
//
// Recovery flow: viewer (must be owner) re-pastes the original seed,
// FE confirms sha256(seed) matches the on-chain getSeedHash binding,
// fires /api/mint/score to regenerate the TEE attestation against the
// same tokenId, then submits recordMintScores via the user wallet.
//
// Mounted from fighter-detail.tsx only when isScored() returns false
// AND viewer === owner. Self-contained — no parent state coupling
// beyond the tokenId and a `onCommitted` callback that triggers a
// page refresh once the on-chain write confirms.

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  sha256,
  stringToBytes,
  stringToHex,
  type Address,
} from "viem";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

type Phase = "idle" | "scoring" | "signing" | "confirming" | "error";

interface CommitScoresPanelProps {
  tokenId: number;
  onCommitted?: () => void;
}

export function CommitScoresPanel({
  tokenId,
  onCommitted,
}: CommitScoresPanelProps) {
  const router = useRouter();
  const { push } = useToast();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [seed, setSeed] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pull the committed seedHash so we can hash-match locally before
  // burning the LLM judge spend. Mismatch = wrong seed, no point
  // hitting the TEE.
  const { data: onChainSeedHash } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "getSeedHash",
    args: [BigInt(tokenId)],
    query: { enabled: FIGHTER_INFT_ADDRESS !== "" },
  });

  const submit = async () => {
    setErrorMessage(null);
    if (!walletClient) {
      setErrorMessage("Wallet not connected");
      setPhase("error");
      return;
    }
    if (!publicClient) {
      setErrorMessage("RPC client not ready");
      setPhase("error");
      return;
    }
    const trimmed = seed.trim();
    if (trimmed.length === 0) {
      setErrorMessage("Paste your original seed text first.");
      setPhase("error");
      return;
    }

    // Local hash-match against the on-chain commitment. Avoids
    // wasting a TEE call when the seed obviously doesn't match.
    const localHash = sha256(stringToBytes(trimmed));
    if (
      onChainSeedHash &&
      String(onChainSeedHash).toLowerCase() !== localHash.toLowerCase()
    ) {
      setErrorMessage(
        `Seed sha256 doesn't match the seedHash committed at mint. Make sure you paste the exact text you minted with.`,
      );
      setPhase("error");
      return;
    }

    try {
      setPhase("scoring");
      const scoreRes = await fetch("/api/mint/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed: trimmed,
          tokenId,
          fighterAddr: FIGHTER_INFT_ADDRESS,
          chainId: activeChain.id,
        }),
      });
      if (!scoreRes.ok) {
        const body = (await scoreRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error ?? `Score endpoint returned ${scoreRes.status}`,
        );
      }
      const data = (await scoreRes.json()) as {
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
        signedText: string;
        teeSignature: `0x${string}`;
        mode?: string;
      };
      if (
        !data.responseBodyHex ||
        !data.signedText ||
        !data.teeSignature ||
        data.contentOffset === undefined ||
        data.contentOffset === null
      ) {
        throw new Error(
          "Score endpoint returned a mock/incomplete attestation — recordMintScores needs the full live bundle.",
        );
      }

      setPhase("signing");
      const txHash = await walletClient.writeContract({
        address: FIGHTER_INFT_ADDRESS as `0x${string}`,
        abi: FIGHTER_INFT_ABI,
        functionName: "recordMintScores",
        args: [
          BigInt(tokenId),
          [
            data.scores.logos,
            data.scores.rhetoric,
            data.scores.aggression,
            data.scores.range,
            data.scores.concreteness,
          ],
          data.seedHash,
          data.responseBodyHex,
          BigInt(data.contentOffset),
          stringToHex(data.signedText),
          data.teeSignature,
        ],
      });

      setPhase("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        pollingInterval: 4_000,
        retryCount: 60,
        retryDelay: 4_000,
        timeout: 5 * 60_000,
      });
      if (receipt.status !== "success") {
        throw new Error("recordMintScores tx reverted");
      }
      push({
        kind: "success",
        text: `Fighter #${tokenId} traits committed on-chain.`,
      });
      onCommitted?.();
      router.refresh();
      setPhase("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Commit failed";
      setErrorMessage(msg);
      setPhase("error");
    }
  };

  const running =
    phase === "scoring" || phase === "signing" || phase === "confirming";
  const phaseLabel: string =
    phase === "scoring"
      ? "Scoring persona via TEE (~15–30s)"
      : phase === "signing"
        ? "Sign recordMintScores in your wallet"
        : phase === "confirming"
          ? "Confirming on-chain"
          : "Idle";

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div className="label">Commit TEE persona scores</div>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Recovery
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--tx-secondary)",
          lineHeight: 1.6,
          marginBottom: 14,
        }}
      >
        This fighter exists on-chain but its 5 persona traits were never
        committed (<span className="mono">isScored = false</span>). Without
        scores, archetype abilities can't unlock. Re-paste your original seed
        below; we hash-match it against the on-chain{" "}
        <span className="mono">seedHash</span>, run the TEE judge against the
        same <span className="num">tokenId</span>, and submit{" "}
        <span className="mono">recordMintScores</span> from your wallet.
        Gas-only, no mint fee.
      </div>
      <Textarea
        value={seed}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          setSeed(e.target.value)
        }
        placeholder="Paste the seed text exactly as you used at mint…"
        rows={6}
        disabled={running}
        style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.5 }}
      />
      {running && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: 1.2,
            marginBottom: 10,
          }}
        >
          {phaseLabel}…
        </div>
      )}
      {phase === "error" && errorMessage && (
        <div
          style={{
            padding: 10,
            background: "rgba(232,107,107,0.08)",
            border: "1px solid rgba(232,107,107,0.30)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--danger)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          {errorMessage}
        </div>
      )}
      <Button
        size="sm"
        variant="primary"
        onClick={() => void submit()}
        disabled={running || seed.trim().length === 0}
      >
        {running ? "Working…" : "Commit scores"}
      </Button>
    </Card>
  );
}

export interface CommitScoresGateProps {
  tokenId: number;
  ownerAddr: Address | `0x${string}` | string;
  viewerAddr: Address | `0x${string}` | string | null | undefined;
  onCommitted?: () => void;
}

/** Thin gate: read `isScored(tokenId)` on-chain; if false AND the
 *  connected viewer matches the fighter owner, render the recovery
 *  panel. Otherwise render nothing — fighters that are already scored
 *  don't see anything new. */
export function CommitScoresGate({
  tokenId,
  ownerAddr,
  viewerAddr,
  onCommitted,
}: CommitScoresGateProps) {
  const { data: isScored } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "isScored",
    args: [BigInt(tokenId)],
    query: { enabled: FIGHTER_INFT_ADDRESS !== "" },
  });

  const isOwner =
    !!viewerAddr &&
    String(viewerAddr).toLowerCase() === String(ownerAddr).toLowerCase();

  if (isScored !== false || !isOwner) return null;
  return <CommitScoresPanel tokenId={tokenId} onCommitted={onCommitted} />;
}
