"use client";

import { useCallback, useMemo, useState } from "react";
import { keccak256, stringToBytes } from "viem";
import { usePublicClient, useReadContract, useWalletClient } from "wagmi";
import {
  YAP_SUBNAME_ABI,
  YAP_SUBNAME_ADDRESS,
} from "@/lib/contracts";

const SUBNAME_SUFFIX = ".yap.0g";

const LABEL_REGEX = /^[a-z0-9-]+$/;
const LABEL_MIN_LENGTH = 3;
const LABEL_MAX_LENGTH = 32;

export function isValidLabelShape(label: string): boolean {
  if (label.length < LABEL_MIN_LENGTH || label.length > LABEL_MAX_LENGTH) {
    return false;
  }
  if (!LABEL_REGEX.test(label)) return false;
  // Disallow leading/trailing hyphens — common ENS-ish convention.
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return true;
}

/** Validate user input + return either the cleaned label or an error
 *  message ready to surface in the UI. */
export function checkLabel(raw: string): { ok: true; label: string } | { ok: false; reason: string } {
  const label = raw.trim().toLowerCase();
  if (label.length === 0) return { ok: false, reason: "Label can't be empty." };
  if (label.length < LABEL_MIN_LENGTH) {
    return { ok: false, reason: `Need at least ${LABEL_MIN_LENGTH} chars.` };
  }
  if (label.length > LABEL_MAX_LENGTH) {
    return { ok: false, reason: `Max ${LABEL_MAX_LENGTH} chars.` };
  }
  if (!LABEL_REGEX.test(label)) {
    return { ok: false, reason: "Lowercase a–z, 0–9, hyphens only." };
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    return { ok: false, reason: "Hyphens can't lead or trail the label." };
  }
  return { ok: true, label };
}

export function formatSubname(label: string): string {
  return `${label}${SUBNAME_SUFFIX}`;
}

/** Reverse-resolve a single tokenId to its registered label.
 *  Returns null if not registered or registry not configured. */
export function useSubname(tokenId: number | null) {
  const enabled = YAP_SUBNAME_ADDRESS !== "" && tokenId !== null;
  const { data, isLoading, refetch } = useReadContract({
    address: YAP_SUBNAME_ADDRESS as `0x${string}`,
    abi: YAP_SUBNAME_ABI,
    functionName: "labelOf",
    args: enabled ? [BigInt(tokenId!)] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });
  const label = typeof data === "string" && data.length > 0 ? data : null;
  return {
    label,
    fullName: label ? formatSubname(label) : null,
    isLoading,
    refetch,
  };
}

/** Batch reverse-resolve via `resolveBatch(uint256[]) → string[]`.
 *  Empty / unregistered tokenIds come back as empty strings; we map
 *  to null in the returned record so callers can treat both cases the
 *  same way. */
export function useSubnameBatch(tokenIds: number[]) {
  const enabled =
    YAP_SUBNAME_ADDRESS !== "" && tokenIds.length > 0;
  // Stabilize the args array reference so wagmi caches by content,
  // not by object identity.
  const argTokenIds = useMemo(
    () => (enabled ? [tokenIds.map((id) => BigInt(id))] : undefined),
    [enabled, tokenIds],
  );
  const { data, isLoading } = useReadContract({
    address: YAP_SUBNAME_ADDRESS as `0x${string}`,
    abi: YAP_SUBNAME_ABI,
    functionName: "resolveBatch",
    args: argTokenIds as unknown as readonly [readonly bigint[]] | undefined,
    query: { enabled, refetchInterval: 60_000 },
  });

  const labels = useMemo(() => {
    if (!Array.isArray(data)) return {} as Record<number, string | null>;
    const out: Record<number, string | null> = {};
    tokenIds.forEach((id, i) => {
      const v = data[i];
      out[id] = typeof v === "string" && v.length > 0 ? v : null;
    });
    return out;
  }, [data, tokenIds]);

  return { labels, isLoading };
}

/** Forward-resolve a label to its current owner tokenId.
 *  Returns null if not registered. Useful for "<label>.yap.0g" deep links. */
export function useTokenIdOf(label: string | null) {
  const enabled = YAP_SUBNAME_ADDRESS !== "" && !!label && isValidLabelShape(label);
  const { data, isLoading } = useReadContract({
    address: YAP_SUBNAME_ADDRESS as `0x${string}`,
    abi: YAP_SUBNAME_ABI,
    functionName: "tokenIdOf",
    args: enabled ? [label!] : undefined,
    query: { enabled },
  });
  const tokenId = typeof data === "bigint" && data > 0n ? Number(data) : null;
  return { tokenId, isLoading };
}

/** Live availability check for a candidate label. Debounce upstream
 *  (in the form) to avoid hammering the RPC on every keystroke. */
export function useLabelAvailability(label: string | null) {
  const valid = !!label && isValidLabelShape(label);
  const enabled = YAP_SUBNAME_ADDRESS !== "" && valid;
  const { data, isLoading } = useReadContract({
    address: YAP_SUBNAME_ADDRESS as `0x${string}`,
    abi: YAP_SUBNAME_ABI,
    functionName: "isAvailable",
    args: enabled ? [label!] : undefined,
    query: { enabled, refetchInterval: 0 },
  });
  return {
    available: typeof data === "boolean" ? data : null,
    isLoading,
  };
}

/** Live registration fee (wei). Reactive — admin can adjust on-chain. */
export function useSubnameRegisterFee() {
  const enabled = YAP_SUBNAME_ADDRESS !== "";
  const { data } = useReadContract({
    address: YAP_SUBNAME_ADDRESS as `0x${string}`,
    abi: YAP_SUBNAME_ABI,
    functionName: "registerFee",
    query: { enabled, refetchInterval: 60_000 },
  });
  return (data as bigint | undefined) ?? 0n;
}

interface RegisterArgs {
  tokenId: number;
  label: string;
}

interface RegisterResult {
  txHash: `0x${string}`;
}

export function useRegisterSubname() {
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const fee = useSubnameRegisterFee();

  const write = useCallback(
    async ({ tokenId, label }: RegisterArgs): Promise<RegisterResult> => {
      setError(null);
      const checked = checkLabel(label);
      if (!checked.ok) throw new Error(checked.reason);
      if (!walletClient) throw new Error("Wallet not connected");
      if (!publicClient) throw new Error("RPC client not ready");
      if (YAP_SUBNAME_ADDRESS === "") {
        throw new Error("YapSubnameRegistrar not configured for this network");
      }

      setIsPending(true);
      try {
        const txHash = await walletClient.writeContract({
          address: YAP_SUBNAME_ADDRESS as `0x${string}`,
          abi: YAP_SUBNAME_ABI,
          functionName: "register",
          args: [checked.label, BigInt(tokenId)],
          value: fee,
        });
        setIsPending(false);
        setIsConfirming(true);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        setIsConfirming(false);
        if (receipt.status !== "success") {
          throw new Error("register tx reverted");
        }
        return { txHash };
      } catch (e) {
        setIsPending(false);
        setIsConfirming(false);
        const err = e instanceof Error ? e : new Error("register failed");
        setError(err);
        throw err;
      }
    },
    [walletClient, publicClient, fee],
  );

  return { write, isPending, isConfirming, error, fee };
}

interface ReleaseArgs {
  tokenId: number;
}

export function useReleaseSubname() {
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const write = useCallback(
    async ({ tokenId }: ReleaseArgs): Promise<{ txHash: `0x${string}` }> => {
      setError(null);
      if (!walletClient) throw new Error("Wallet not connected");
      if (!publicClient) throw new Error("RPC client not ready");
      if (YAP_SUBNAME_ADDRESS === "") {
        throw new Error("YapSubnameRegistrar not configured for this network");
      }
      setIsPending(true);
      try {
        const txHash = await walletClient.writeContract({
          address: YAP_SUBNAME_ADDRESS as `0x${string}`,
          abi: YAP_SUBNAME_ABI,
          functionName: "release",
          args: [BigInt(tokenId)],
        });
        setIsPending(false);
        setIsConfirming(true);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 4_000,
          retryCount: 60,
          retryDelay: 4_000,
          timeout: 5 * 60_000,
        });
        setIsConfirming(false);
        if (receipt.status !== "success") throw new Error("release tx reverted");
        return { txHash };
      } catch (e) {
        setIsPending(false);
        setIsConfirming(false);
        const err = e instanceof Error ? e : new Error("release failed");
        setError(err);
        throw err;
      }
    },
    [walletClient, publicClient],
  );

  return { write, isPending, isConfirming, error };
}

/** Helper: keccak label hash (matches contract's labelHash event field). */
export function labelHash(label: string): `0x${string}` {
  return keccak256(stringToBytes(label));
}
