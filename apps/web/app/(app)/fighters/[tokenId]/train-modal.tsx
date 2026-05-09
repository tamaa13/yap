"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTrainFighter, type TrainPhase } from "@/hooks/use-train-fighter";
import type { Address } from "viem";

interface TrainModalProps {
  open: boolean;
  onClose: () => void;
  tokenId: number;
  owner: Address;
  fighterName: string;
  archetype: string;
  /** Existing signature lines from the fighter's prior training. Combined
   *  with the user's new lines into the next training session's seed. */
  priorSignature: string[];
}

const PHASE_LABEL: Record<TrainPhase, string> = {
  idle: "",
  queued: "Queued",
  "uploading-seed": "Uploading new lines to 0G Storage",
  encrypting: "Sealing the updated persona",
  "uploading-encrypted": "Publishing encrypted INFT to 0G Storage",
  signing: "Sign FighterTrainer.train() in your wallet",
  minting: "Waiting for on-chain confirmation",
  done: "Done — new training session recorded",
  error: "Failed",
};

export function TrainModal({
  open,
  onClose,
  tokenId,
  owner,
  fighterName,
  archetype,
  priorSignature,
}: TrainModalProps) {
  const [extraLines, setExtraLines] = useState("");
  const train = useTrainFighter();
  const busy =
    train.phase !== "idle" && train.phase !== "done" && train.phase !== "error";

  const submit = async () => {
    const newLines = extraLines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (newLines.length === 0) return;

    // Server pipeline expects JSONL — wrap raw lines in {prompt, completion}
    // shape, mirroring /api/mint. Combine prior signature lines (from
    // earlier training sessions) so the fighter's accumulated personality
    // persists into the next sealed payload.
    const combined = [
      ...priorSignature.map((line) =>
        JSON.stringify({
          prompt: `Stay in character as ${fighterName}, a ${archetype}.`,
          completion: line,
        }),
      ),
      ...newLines.map((line) =>
        JSON.stringify({
          prompt: `Stay in character as ${fighterName}, a ${archetype}.`,
          completion: line,
        }),
      ),
    ].join("\n");

    try {
      await train.write({
        tokenId,
        owner,
        styleSeed: combined,
        archetype,
        name: fighterName,
      });
    } catch {
      // Hook surfaces error in `train.error` already.
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          train.reset();
          setExtraLines("");
          onClose();
        }
      }}
      title={`Train ${fighterName}`}
      width={560}
      footer={
        train.phase === "done" ? (
          <Button
            variant="primary"
            onClick={() => {
              train.reset();
              setExtraLines("");
              onClose();
            }}
          >
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy || extraLines.trim().length === 0}
            >
              {busy
                ? PHASE_LABEL[train.phase]
                : "Start training session"}
            </Button>
          </>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
          Add new lines in your fighter&apos;s voice — quotes from a recent
          battle, lessons from a defeat, sharper one-liners. Each training
          session re-seals the persona on 0G Storage and records a new{" "}
          <code>FighterTrained</code> event on-chain so the evolution
          timeline is independently verifiable.
        </p>

        <textarea
          rows={8}
          placeholder="One line per example. Crypto is a slot machine with extra steps. Centralized exchanges always come back to bite you. ..."
          value={extraLines}
          onChange={(e) => setExtraLines(e.target.value)}
          disabled={busy}
          style={{
            width: "100%",
            padding: 12,
            background: "var(--bg-raised)",
            color: "inherit",
            border: "1px solid var(--bd-default)",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />

        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {priorSignature.length} prior signature line
          {priorSignature.length === 1 ? "" : "s"} will be combined with{" "}
          {extraLines.split("\n").filter((l) => l.trim()).length} new line
          {extraLines.split("\n").filter((l) => l.trim()).length === 1
            ? ""
            : "s"}{" "}
          for the next training session.
        </div>

        {train.phase !== "idle" && (
          <div
            style={{
              padding: 12,
              background: "var(--bg-raised)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {PHASE_LABEL[train.phase]}
            </div>
            {train.error && (
              <div style={{ color: "var(--danger)", marginTop: 6 }}>
                {train.error.message}
              </div>
            )}
            {train.result && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                Session #{train.result.sessionNumber} ·{" "}
                <a
                  href={train.result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  view on explorer
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
