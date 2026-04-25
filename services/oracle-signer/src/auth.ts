// HMAC-based request authentication.
//
// The signer service is an internal-trust component: only the Yap relayer
// should be able to ask for verdict signatures. We use a shared secret to
// authenticate requests. The shared secret lives:
//   - On the Yap relayer side: in env var ZG_ORACLE_SIGNER_SECRET
//   - On the signer side: as a dstack-derived secret (so it's bound to the
//     same enclave as the signing key)
//
// HMAC scope: covers the entire signing payload (battleId, winner,
// verdictHash, escrowAddress, chainId, timestamp). Timestamp prevents
// replay of valid HMAC against stale (battleId, winner) — signer rejects
// if timestamp drifts beyond TIMESTAMP_WINDOW_MS.

import { createHmac, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_WINDOW_MS = 60_000; // ±60s

export function computeRequestHmac(
  secret: string,
  payload: {
    battleId: string;
    winner: number;
    verdictHash: string;
    escrowAddress: string;
    chainId: string;
    timestamp: number;
  },
): string {
  const canonical = [
    payload.battleId,
    String(payload.winner),
    payload.verdictHash.toLowerCase(),
    payload.escrowAddress.toLowerCase(),
    payload.chainId,
    String(payload.timestamp),
  ].join("|");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifyHmac(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export function checkTimestamp(timestamp: number): boolean {
  const drift = Math.abs(Date.now() - timestamp);
  return drift <= TIMESTAMP_WINDOW_MS;
}
