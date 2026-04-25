// Yap oracle signer service.
//
// Runs inside a Phala dstack TEE enclave (production) or locally (dev).
// Holds the oracle private key in enclave-protected memory and signs
// verdict digests on behalf of the Yap battle runner. Even Yap's own
// admin can't extract the production key — the brief-aligned guarantee
// is "verdicts can only be produced inside this attested enclave".
//
// Endpoints:
//   GET  /health         — basic liveness check
//   GET  /info           — public signer metadata (address, attestation source)
//   GET  /attestation    — TDX quote binding the signer address (for verifiers)
//   POST /sign           — sign a verdict digest (HMAC-authed)

import express, { type Request, type Response } from "express";
import { AbiCoder, getBytes, keccak256, Wallet } from "ethers";
import { loadOracleKey, generateAttestation } from "./key.js";
import { checkTimestamp, computeRequestHmac, verifyHmac } from "./auth.js";

const PORT = Number(process.env.PORT ?? 3030);
const SHARED_SECRET = process.env.ORACLE_SIGNER_SECRET ?? "";
if (!SHARED_SECRET) {
  console.error(
    "[oracle-signer] ORACLE_SIGNER_SECRET not set — refusing to start",
  );
  process.exit(1);
}

interface SignBody {
  battleId?: string;
  winner?: number;
  verdictHash?: string;
  escrowAddress?: string;
  chainId?: string;
  timestamp?: number;
  hmac?: string;
}

async function main(): Promise<void> {
  const key = await loadOracleKey();
  const wallet = new Wallet(key.privateKey);
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  // Cache attestation so repeated /attestation hits don't spam dstack.sock.
  let attestationCache: { quote: string; eventLog: string } | null = null;
  const attestation = await generateAttestation(key.address);
  if (attestation) attestationCache = attestation;

  console.log(`[oracle-signer] address=${key.address} source=${key.source}`);
  if (key.source === "dev-fallback") {
    console.warn(
      "[oracle-signer] WARNING: running with dev fallback key. NOT for mainnet.",
    );
  }

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/info", (_req, res) => {
    res.json({
      address: key.address,
      source: key.source,
      appId: key.appId,
      instanceId: key.instanceId,
      attestationAvailable: attestationCache !== null,
    });
  });

  app.get("/attestation", (_req, res) => {
    if (!attestationCache) {
      res.status(503).json({
        error:
          "no attestation available — signer is not running inside a TEE enclave",
        source: key.source,
      });
      return;
    }
    res.json({
      address: key.address,
      appId: key.appId,
      instanceId: key.instanceId,
      quote: attestationCache.quote,
      eventLog: attestationCache.eventLog,
    });
  });

  app.post("/sign", async (req: Request<unknown, unknown, SignBody>, res: Response) => {
    const body = req.body ?? {};

    // Schema validation.
    if (
      typeof body.battleId !== "string" ||
      typeof body.winner !== "number" ||
      typeof body.verdictHash !== "string" ||
      typeof body.escrowAddress !== "string" ||
      typeof body.chainId !== "string" ||
      typeof body.timestamp !== "number" ||
      typeof body.hmac !== "string"
    ) {
      res.status(400).json({ error: "invalid request shape" });
      return;
    }
    if (body.winner < 0 || body.winner > 2) {
      res.status(400).json({ error: "winner must be 0, 1, or 2" });
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(body.verdictHash)) {
      res.status(400).json({ error: "verdictHash must be 32-byte hex" });
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(body.escrowAddress)) {
      res.status(400).json({ error: "escrowAddress must be 20-byte hex" });
      return;
    }

    // Timestamp window — prevents replay of valid HMACs.
    if (!checkTimestamp(body.timestamp)) {
      res.status(400).json({ error: "timestamp out of window" });
      return;
    }

    // HMAC validation.
    const expected = computeRequestHmac(SHARED_SECRET, {
      battleId: body.battleId,
      winner: body.winner,
      verdictHash: body.verdictHash,
      escrowAddress: body.escrowAddress,
      chainId: body.chainId,
      timestamp: body.timestamp,
    });
    if (!verifyHmac(expected, body.hmac)) {
      res.status(401).json({ error: "invalid hmac" });
      return;
    }

    // Compute the on-chain digest matching BattleEscrow.verdictDigest.
    try {
      const coder = AbiCoder.defaultAbiCoder();
      const encoded = coder.encode(
        ["address", "uint256", "uint256", "uint8", "bytes32"],
        [
          body.escrowAddress,
          BigInt(body.chainId),
          BigInt(body.battleId),
          body.winner,
          body.verdictHash,
        ],
      );
      const innerHash = keccak256(encoded);
      const signature = await wallet.signMessage(getBytes(innerHash));

      res.json({
        address: key.address,
        signature,
        innerHash,
        source: key.source,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[oracle-signer] sign error", message);
      res.status(500).json({ error: "signing failed" });
    }
  });

  app.listen(PORT, () => {
    console.log(`[oracle-signer] listening on :${PORT}`);
  });
}

main().catch((e) => {
  console.error("[oracle-signer] fatal", e);
  process.exit(1);
});
