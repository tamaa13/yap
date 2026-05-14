// Resilient tx-receipt waiter for 0G Aristotle.
//
// Tama hit `waitForTransactionReceipt` throwing
// `TransactionReceiptNotFoundError` mid-mint *after* the tx had already
// landed on-chain (verified via cast — block 33216122 ✓ fighter #12
// minted, traits committed). 0G's RPC sometimes lags briefly before
// surfacing a freshly mined tx; viem's poll loop can give up between
// "tx submitted" and "receipt observable".
//
// Strategy here:
//   1. Run viem's `waitForTransactionReceipt` with an aggressive budget
//      (2s polling × 240 retries = 8 min + 10 min hard timeout, single
//      confirmation).
//   2. On any failure, fall through to a direct `getTransactionReceipt`
//      poll for up to `fallbackMs` (default 90s). Sometimes viem's
//      wait throws on `null` receipt; the direct call returns the
//      already-mined receipt cleanly.
//   3. If still nothing, throw a typed `ReceiptPendingError` carrying
//      the txHash + a chainscan URL the UI can surface. Caller can
//      treat it as "submitted, not yet confirmed" instead of "failed".

import type { Hash, PublicClient } from "viem";
import { activeChain } from "@/lib/chains";

export interface WaitReceiptOptions {
  /** Total budget for the direct-poll fallback after viem's wait
   *  bails. Default 90s. */
  fallbackMs?: number;
}

/** Thrown when the tx is submitted but the receipt never surfaces
 *  within the budget. The hash is included so the caller can render
 *  a "submitted, awaiting confirmation" surface with a chainscan
 *  link rather than an outright failure. */
export class ReceiptPendingError extends Error {
  readonly hash: Hash;
  readonly explorerUrl: string;
  constructor(hash: Hash, message?: string) {
    const explorer = `${activeChain.blockExplorers.default.url}/tx/${hash}`;
    super(
      message ??
        `Transaction ${hash} was submitted but its receipt hasn't surfaced yet. Check ${explorer} to confirm on-chain state, or retry from the recovery flow on the fighter detail page.`,
    );
    this.name = "ReceiptPendingError";
    this.hash = hash;
    this.explorerUrl = explorer;
  }
}

export async function waitReceiptResilient(
  client: PublicClient,
  hash: Hash,
  opts: WaitReceiptOptions = {},
): Promise<Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>> {
  // First pass — viem's wait with an aggressive budget. Most txs
  // land here; the fallback is paranoia rail.
  try {
    return await client.waitForTransactionReceipt({
      hash,
      pollingInterval: 2_000,
      retryCount: 240,
      retryDelay: 2_000,
      timeout: 10 * 60_000,
      confirmations: 1,
    });
  } catch (firstError) {
    // Direct poll. Some 0G RPC blips return `null` for a freshly
    // mined tx; the direct call surfaces the receipt as soon as
    // the indexing catches up.
    const fallbackMs = opts.fallbackMs ?? 90_000;
    const fallbackStart = Date.now();
    while (Date.now() - fallbackStart < fallbackMs) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        if (receipt) return receipt;
      } catch {
        // Swallow — direct call also throws when receipt is missing.
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
    // Surface as pending — the tx may still confirm later. The
    // caller renders a chainscan link instead of a hard error.
    throw new ReceiptPendingError(
      hash,
      firstError instanceof Error
        ? `Tx ${hash} submitted; receipt still not observable after the extended wait. Original wait error: ${firstError.message}. Check ${activeChain.blockExplorers.default.url}/tx/${hash}.`
        : undefined,
    );
  }
}
