// Derive the oracle signing key.
//
// In production (dstack): the key is derived deterministically from the
// enclave's hardware identity via @phala/dstack-sdk. Same enclave + same
// derivation path always produces the same key. The plaintext key never
// leaves protected enclave memory; even Phala's operator can't extract it.
//
// In simulator/local dev: falls back to a fixed dev key from env so the
// runner can still be exercised end-to-end on testnet without a real TEE.
// The dev key is clearly marked in /info responses so spectators can tell
// when the signer is running outside an attested enclave.

import { Wallet } from "ethers";
import { DstackClient } from "@phala/dstack-sdk";

export interface OracleKeyContext {
  /** Hex-encoded private key (always present so we can sign). */
  privateKey: `0x${string}`;
  /** Public address derived from the private key. */
  address: `0x${string}`;
  /** Where the key came from — exposed in /info for verifiability. */
  source: "dstack" | "simulator" | "dev-fallback";
  /** dstack app_id when source=dstack. Empty otherwise. */
  appId: string;
  /** dstack instance_id when source=dstack. Empty otherwise. */
  instanceId: string;
}

const DSTACK_KEY_PATH = "yap/oracle/v1";

function uint8ToPrivateKey(bytes: Uint8Array): `0x${string}` {
  // GetKeyResponse.key is a 32-byte secp256k1 private key. Convert to the
  // 0x-prefixed lowercase hex format ethers expects.
  return `0x${Buffer.from(bytes).toString("hex")}` as `0x${string}`;
}

function tryNewDstackClient(): DstackClient | null {
  try {
    return new DstackClient();
  } catch {
    // SDK throws if /var/run/dstack.sock is absent (running outside dstack
    // and without the simulator). That's our cue to fall back to dev mode.
    return null;
  }
}

export async function loadOracleKey(): Promise<OracleKeyContext> {
  const client = tryNewDstackClient();
  const reachable = client
    ? await client.isReachable().catch(() => false)
    : false;

  if (client && reachable) {
    const info = await client.info().catch(() => null);
    const inDstack = !!info?.app_id && !!info.instance_id;
    if (inDstack && info) {
      const keyResponse = await client.getKey(DSTACK_KEY_PATH);
      const privateKey = uint8ToPrivateKey(keyResponse.key);
      const wallet = new Wallet(privateKey);
      return {
        privateKey,
        address: wallet.address as `0x${string}`,
        source: "dstack",
        appId: info.app_id,
        instanceId: info.instance_id,
      };
    }
    // Reachable but missing app_id → simulator endpoint, treat as dev mode.
    const simKey = await client.getKey(DSTACK_KEY_PATH);
    const privateKey = uint8ToPrivateKey(simKey.key);
    const wallet = new Wallet(privateKey);
    return {
      privateKey,
      address: wallet.address as `0x${string}`,
      source: "simulator",
      appId: "",
      instanceId: "",
    };
  }

  // Not reachable. Use env-supplied dev key. This is intentionally NOT a
  // random key — we want stable address across restarts so the contract's
  // oracleKey doesn't have to rotate every dev cycle.
  const devKey = process.env.ORACLE_DEV_PRIVATE_KEY;
  if (!devKey) {
    throw new Error(
      "dstack unreachable AND ORACLE_DEV_PRIVATE_KEY not set — cannot start signer",
    );
  }
  const wallet = new Wallet(devKey);
  return {
    privateKey: devKey as `0x${string}`,
    address: wallet.address as `0x${string}`,
    source: "dev-fallback",
    appId: "",
    instanceId: "",
  };
}

/**
 * Generate a TEE attestation quote that binds the signer's public address
 * to the running enclave. The verifier can:
 *   1. Verify the quote against Intel PCS (proves it's a real TDX TEE)
 *   2. Read the user data from the quote (= the signer's address)
 *   3. Compare against the on-chain BattleEscrow.oracleKey
 * → cryptographic proof that the on-chain oracleKey lives in this attested enclave.
 *
 * Returns null in simulator/dev modes (no real TEE → no real attestation).
 */
export async function generateAttestation(
  signerAddress: `0x${string}`,
): Promise<{ quote: string; eventLog: string } | null> {
  try {
    const client = tryNewDstackClient();
    if (!client) return null;
    if (!(await client.isReachable())) return null;
    const info = await client.info().catch(() => null);
    if (!info?.app_id) return null;
    // dstack accepts up to 64 bytes of user data; embed the signer address +
    // app/instance ids so the attestation is uniquely tied to this signer.
    const userdata = `${signerAddress}|${info.app_id}|${info.instance_id}`;
    const quote = await client.getQuote(userdata);
    return {
      quote: quote.quote,
      eventLog: quote.event_log,
    };
  } catch {
    return null;
  }
}
