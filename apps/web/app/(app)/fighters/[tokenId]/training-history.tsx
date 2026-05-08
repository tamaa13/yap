"use client";

import { useReadContract } from "wagmi";
import {
  FIGHTER_TRAINER_ABI,
  FIGHTER_TRAINER_ADDRESS,
} from "@/lib/contracts";
import { Hash } from "@/components/ui/hash";

interface TrainingHistoryProps {
  tokenId: number;
}

/**
 * Renders the on-chain training timeline for a fighter. Reads
 * `latestEncryptedURI`, `latestTaskId`, and `trainingCount` from
 * FighterTrainer for a quick "session N" header. Each FighterTrained
 * event corresponds to a real 0G fine-tune attestation.
 *
 * For deeper history we'd subscribe to FighterTrained logs by tokenId,
 * but the headline view only needs the latest session — keeps the
 * component lightweight + RPC-friendly.
 */
export function TrainingHistory({ tokenId }: TrainingHistoryProps) {
  const enabled = FIGHTER_TRAINER_ADDRESS !== "";
  const { data: count } = useReadContract({
    address: FIGHTER_TRAINER_ADDRESS as `0x${string}`,
    abi: FIGHTER_TRAINER_ABI,
    functionName: "trainingCount",
    args: [BigInt(tokenId)],
    query: { enabled },
  });
  const { data: latestUri } = useReadContract({
    address: FIGHTER_TRAINER_ADDRESS as `0x${string}`,
    abi: FIGHTER_TRAINER_ABI,
    functionName: "latestEncryptedURI",
    args: [BigInt(tokenId)],
    query: { enabled },
  });
  const { data: latestTask } = useReadContract({
    address: FIGHTER_TRAINER_ADDRESS as `0x${string}`,
    abi: FIGHTER_TRAINER_ABI,
    functionName: "latestTaskId",
    args: [BigInt(tokenId)],
    query: { enabled },
  });

  if (!enabled) return null;
  const sessions = Number((count as bigint | undefined) ?? 0n);
  if (sessions === 0) {
    return (
      <div
        style={{
          padding: 14,
          background: "var(--bg-elevated, #161616)",
          border: "1px dashed var(--border, #2a2a2a)",
          borderRadius: 8,
          fontSize: 13,
          opacity: 0.7,
        }}
      >
        <strong>No training sessions yet.</strong> The owner can run a TEE-
        attested fine-tune to add new lessons (e.g. lines from a battle this
        fighter just lost). Each session is recorded on-chain as a{" "}
        <code>FighterTrained</code> event.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-elevated, #161616)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}
      >
        <span
          style={{
            padding: "2px 8px",
            background: "var(--accent, #ffba49)",
            color: "#000",
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          Session {sessions}
        </span>
        <span style={{ opacity: 0.85 }}>training session{sessions === 1 ? "" : "s"} on-chain</span>
      </div>
      {typeof latestTask === "string" && latestTask !== "" && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Latest 0G fine-tune taskId:{" "}
          <code style={{ fontSize: 11 }}>{latestTask}</code>
        </div>
      )}
      {typeof latestUri === "string" && latestUri !== "" && (
        <div style={{ fontSize: 12, opacity: 0.7, wordBreak: "break-all" }}>
          Latest weights URI:{" "}
          <Hash value={latestUri.replace(/^0g:\/\//, "")} copy />
        </div>
      )}
    </div>
  );
}
