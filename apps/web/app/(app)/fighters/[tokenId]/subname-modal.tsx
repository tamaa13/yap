"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  checkLabel,
  formatSubname,
  useLabelAvailability,
  useRegisterSubname,
  useReleaseSubname,
  useSubnameRegisterFee,
} from "@/hooks/use-subname";

export function SubnameModal({
  open,
  onClose,
  tokenId,
  currentLabel,
  currentFullName,
  onChanged,
  releaseSubname,
}: {
  open: boolean;
  onClose: () => void;
  tokenId: number;
  currentLabel: string | null;
  currentFullName: string | null;
  onChanged: () => unknown;
  releaseSubname: ReturnType<typeof useReleaseSubname>;
}) {
  const { push } = useToast();
  const register = useRegisterSubname();
  const fee = useSubnameRegisterFee();
  const [draft, setDraft] = useState("");

  // Live shape validation + on-chain availability check.
  const checked = checkLabel(draft);
  const labelForCheck = checked.ok ? checked.label : null;
  const { available, isLoading: checkingAvail } = useLabelAvailability(labelForCheck);

  const busy = register.isPending || register.isConfirming || releaseSubname.isPending || releaseSubname.isConfirming;

  const submit = async () => {
    if (!checked.ok) {
      push({ kind: "error", text: checked.reason });
      return;
    }
    if (available === false) {
      push({ kind: "error", text: `${formatSubname(checked.label)} is taken.` });
      return;
    }
    try {
      const { txHash } = await register.write({ tokenId, label: checked.label });
      push({
        kind: "success",
        text: `${formatSubname(checked.label)} pinned to #${tokenId} · tx ${txHash.slice(0, 10)}…`,
      });
      setDraft("");
      setTimeout(onChanged, 2000);
      onClose();
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't claim the name",
      });
    }
  };

  const submitRelease = async () => {
    try {
      const { txHash } = await releaseSubname.write({ tokenId });
      push({
        kind: "success",
        text: `Released ${currentFullName ?? "the name"} · tx ${txHash.slice(0, 10)}…`,
      });
      setTimeout(onChanged, 2000);
      onClose();
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Release failed",
      });
    }
  };

  const previewFull = checked.ok ? formatSubname(checked.label) : null;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={currentLabel ? `Manage ${currentFullName}` : "Claim a <label>.yap.0g name"}
      footer={
        currentLabel ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={submitRelease}
              disabled={busy}
              title="Free the label so anyone can claim it"
            >
              {releaseSubname.isPending
                ? "Sign in your wallet…"
                : releaseSubname.isConfirming
                  ? "Releasing…"
                  : "Release name"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Back out
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={
                busy ||
                !checked.ok ||
                available === false ||
                (checked.ok && available === null && !checkingAvail)
              }
            >
              {register.isPending
                ? "Sign in your wallet…"
                : register.isConfirming
                  ? "Pinning the name…"
                  : "Claim name"}
            </Button>
          </>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {currentLabel ? (
          <div style={{ fontSize: 13, color: "var(--tx-secondary)", lineHeight: 1.55 }}>
            Fighter #{tokenId} answers to{" "}
            <span
              className="mono"
              style={{ color: "var(--accent)", fontWeight: 600 }}
            >
              {currentFullName}
            </span>{" "}
            on-chain. The name follows the fighter — when you sell or
            transfer, the new owner inherits the binding. Release it to
            free the label up; rebinding requires another fee.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--tx-secondary)", lineHeight: 1.55 }}>
              Pin a permanent <span className="mono">&lt;label&gt;.yap.0g</span> handle to
              this fighter. Lowercase letters, digits, hyphens — 3 to 32 chars.
              The label binds to <span className="mono">#{tokenId}</span> and travels
              with the fighter on transfer.
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Label
              </div>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase())}
                placeholder="e.g. roast-9000"
                trailing={
                  <span
                    className="mono"
                    style={{ color: "var(--tx-tertiary)", fontSize: 12 }}
                  >
                    .yap.0g
                  </span>
                }
                disabled={busy}
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color:
                    !checked.ok && draft.length > 0
                      ? "var(--danger)"
                      : available === false
                        ? "var(--danger)"
                        : available === true
                          ? "var(--success)"
                          : "var(--tx-tertiary)",
                  minHeight: 16,
                }}
              >
                {draft.length === 0
                  ? "Type a label to check availability."
                  : !checked.ok
                    ? checked.reason
                    : checkingAvail
                      ? "Checking availability…"
                      : available === false
                        ? `${previewFull} is taken.`
                        : available === true
                          ? `${previewFull} is open. Claim it.`
                          : "Idle."}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                background: "var(--bg-sunken)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--tx-secondary)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Registration fee</span>
              <span className="mono" style={{ color: "var(--tx-primary)" }}>
                {Number(formatEther(fee)).toFixed(4)} 0G
              </span>
            </div>
          </>
        )}
        {register.error && !currentLabel && (
          <div
            style={{
              padding: 10,
              background: "rgba(232,107,107,0.08)",
              border: "1px solid rgba(232,107,107,0.30)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--tx-primary)",
              wordBreak: "break-word",
            }}
          >
            {register.error.message}
          </div>
        )}
        {releaseSubname.error && currentLabel && (
          <div
            style={{
              padding: 10,
              background: "rgba(232,107,107,0.08)",
              border: "1px solid rgba(232,107,107,0.30)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--tx-primary)",
              wordBreak: "break-word",
            }}
          >
            {releaseSubname.error.message}
          </div>
        )}
      </div>
    </Modal>
  );
}
