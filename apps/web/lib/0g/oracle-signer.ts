// Client for the Yap oracle signer service (services/oracle-signer).
//
// The signer holds the oracle private key inside a Phala dstack TEE
// enclave (production) or a local sidecar (dev). The runner here never
// touches the key — it sends an HMAC-authed request and gets back the
// ECDSA signature.
//
// In testnet dev where no signer is deployed, falls back to local signing
// with ZG_ORACLE_PRIVATE_KEY so the runner stays exercise-able. The
// fallback path explicitly logs that it's running without TEE.

import "server-only";
import { createHmac } from "node:crypto";
import {
  AbiCoder,
  Wallet,
  getBytes,
  keccak256,
} from "ethers";

export interface VerdictPayload {
  battleId: bigint;
  winner: 0 | 1 | 2;
  verdictHash: `0x${string}`;
  escrowAddress: `0x${string}`;
  chainId: bigint;
}

export interface VerdictSignature {
  signature: `0x${string}`;
  signerAddress: `0x${string}`;
  /** Where the signer key lives — informational, surfaced in logs/UI. */
  source: "dstack" | "simulator" | "dev-fallback" | "local-fallback";
}

/**
 * Sign a verdict via the configured oracle signer service. Falls back to
 * local signing with ZG_ORACLE_PRIVATE_KEY when ZG_ORACLE_SIGNER_URL is
 * unset, so testnet dev without a deployed signer keeps working.
 */
export async function signVerdict(
  payload: VerdictPayload,
): Promise<VerdictSignature> {
  const url = process.env.ZG_ORACLE_SIGNER_URL;
  const secret = process.env.ZG_ORACLE_SIGNER_SECRET;

  if (url && secret) {
    return await signViaService(url, secret, payload);
  }

  return await signLocally(payload);
}

async function signViaService(
  baseUrl: string,
  secret: string,
  payload: VerdictPayload,
): Promise<VerdictSignature> {
  const timestamp = Date.now();
  const body = {
    battleId: payload.battleId.toString(),
    winner: payload.winner,
    verdictHash: payload.verdictHash.toLowerCase() as `0x${string}`,
    escrowAddress: payload.escrowAddress.toLowerCase() as `0x${string}`,
    chainId: payload.chainId.toString(),
    timestamp,
  };
  const canonical = [
    body.battleId,
    String(body.winner),
    body.verdictHash,
    body.escrowAddress,
    body.chainId,
    String(body.timestamp),
  ].join("|");
  const hmac = createHmac("sha256", secret).update(canonical).digest("hex");

  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, hmac }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `oracle signer ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    address: `0x${string}`;
    signature: `0x${string}`;
    source: "dstack" | "simulator" | "dev-fallback";
  };
  return {
    signature: data.signature,
    signerAddress: data.address,
    source: data.source,
  };
}

/**
 * Local fallback for testnet dev without a deployed signer service.
 * Computes the same digest the contract verifies against and signs with
 * the env-resident key. Brief disclosure: this is the pre-Phala-dstack
 * shortcut, only acceptable for testnet — mainnet must run the signer
 * service.
 */
async function signLocally(payload: VerdictPayload): Promise<VerdictSignature> {
  const pk = process.env.ZG_ORACLE_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "no oracle signer configured: set ZG_ORACLE_SIGNER_URL+SECRET (production) or ZG_ORACLE_PRIVATE_KEY (testnet dev fallback)",
    );
  }
  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ["address", "uint256", "uint256", "uint8", "bytes32"],
    [
      payload.escrowAddress,
      payload.chainId,
      payload.battleId,
      payload.winner,
      payload.verdictHash,
    ],
  );
  const innerHash = keccak256(encoded);
  const wallet = new Wallet(pk);
  const signature = (await wallet.signMessage(getBytes(innerHash))) as `0x${string}`;
  return {
    signature,
    signerAddress: wallet.address as `0x${string}`,
    source: "local-fallback",
  };
}
