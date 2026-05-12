import "server-only";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

/**
 * Runner-wallet signer for `YapFighter.logAccess(tokenId, battleId)`.
 * The contract gates the call behind RUNNER_ROLE (granted to the address
 * derived from `RUNNER_PRIVATE_KEY` during the v3 deployment ceremony),
 * so no other path can write into the access log surface.
 *
 * Module-level singleton: instantiating a wallet client on every call
 * would mean a new transport per inference round. Returning null when
 * the env var is missing lets the build still pass in environments
 * without the secret (dev, CI) — call sites no-op cleanly.
 */
const runnerPk = process.env.RUNNER_PRIVATE_KEY as `0x${string}` | undefined;
const runnerAccount = runnerPk ? privateKeyToAccount(runnerPk) : null;
const runnerClient = runnerAccount
  ? createWalletClient({
      account: runnerAccount,
      chain: activeChain,
      transport: http(),
    })
  : null;

let warnedMissingRunner = false;
let warnedMissingFighter = false;

/**
 * Submit a logAccess tx for the fighter that just spoke. Fire-and-forget
 * by design — never await this on the inference response path, since:
 *
 *   - The transaction takes ~1-2s to confirm on Galileo. Blocking the
 *     LLM response on it would add ~30% latency to a 4s round.
 *   - logAccess is observability-only. A failed tx (insufficient gas,
 *     RPC blip, role revoked) shouldn't fail the round. We log and move
 *     on; the round still settles, only the access log misses one entry.
 *   - At settle time the access count is read off-chain via the view
 *     getter, so missing entries are visible as gaps in the audit table
 *     — not a silent integrity failure.
 *
 * Pass the *numeric* battleId (not the `b-<hex>` ui id). Caller is
 * responsible for the conversion if it has the ui form.
 */
export function logFighterAccess(
  tokenId: number | bigint,
  battleId: number | bigint,
): void {
  if (!runnerClient) {
    if (!warnedMissingRunner) {
      warnedMissingRunner = true;
      console.warn(
        "[log-access] RUNNER_PRIVATE_KEY not set — skipping logAccess. " +
          "Set the env on the VPS for the audit log to populate.",
      );
    }
    return;
  }
  if (!FIGHTER_INFT_ADDRESS) {
    if (!warnedMissingFighter) {
      warnedMissingFighter = true;
      console.warn(
        "[log-access] YapFighter address not configured — skipping logAccess.",
      );
    }
    return;
  }

  // Fire-and-forget. `.catch` keeps the unhandled-rejection logger quiet
  // and gives us a structured line if the runner ever stops paying.
  void runnerClient
    .writeContract({
      address: FIGHTER_INFT_ADDRESS as `0x${string}`,
      abi: FIGHTER_INFT_ABI,
      functionName: "logAccess",
      args: [BigInt(tokenId), BigInt(battleId)],
    })
    .catch((e) => {
      console.error(
        `[log-access] logAccess(${tokenId}, ${battleId}) failed:`,
        e instanceof Error ? e.message : e,
      );
    });
}
