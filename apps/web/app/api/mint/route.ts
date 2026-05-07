import { NextResponse } from "next/server";
import { keccak256, toUtf8Bytes, hexlify } from "ethers";
import { fineTune } from "@/lib/0g/compute";
import { encryptWithRandomKey } from "@/lib/0g/encrypt";
import { uploadBuffer } from "@/lib/0g/storage";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

export const runtime = "nodejs";
// Fine-tune can take 2–5 minutes on 0G testnet; bump the function timeout so
// the handler isn't reaped under Vercel defaults.
export const maxDuration = 600;

interface PrepareBody {
  owner?: `0x${string}`;
  name?: string;
  archetype?: string;
  avatar?: number;
  styleSeed?: string;
  baseModel?: string;
}

interface PrepareResponse {
  /** Params to pass to YapFighter.mint() on-chain. */
  mint: {
    to: `0x${string}`;
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
  };
  /** Commitment data for the /api/fighters/commit call post-mint. */
  commit: {
    owner: `0x${string}`;
    name: string;
    archetype: string;
    avatar: number;
    seedRoot: string;
    weightsRoot: string;
    signatureStyle: string[];
    fineTuneBypassed: boolean;
  };
  steps: {
    seedRoot: string;
    fineTuneTaskId: string | null;
    fineTuneProvider: string | null;
    fineTuneBypassed: boolean;
    weightsRoot: string;
  };
}

/**
 * POST /api/mint  — preparation step (no on-chain mint)
 *
 * Performs the expensive off-chain pipeline (upload seed → fine-tune →
 * encrypt → upload weights → compute metadataHash + sealedKey) and returns
 * the values the client needs to sign the `mint()` transaction from its own
 * wallet. The client pays `mintFee` directly to the contract, owns the tx
 * in its history, and no server-side minting key is involved.
 *
 * After the client mints, it POSTs the result to /api/fighters/commit to
 * persist plaintext meta (name, archetype, signatureStyle) keyed by the
 * tokenId emitted from the `Minted` event.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PrepareBody;
  const owner = body.owner;
  const seed = body.styleSeed?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const archetype = body.archetype?.trim() ?? "";
  const avatar = typeof body.avatar === "number" ? body.avatar : 0;
  const baseModel = body.baseModel?.trim() || undefined;

  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return NextResponse.json({ error: "valid owner address required" }, { status: 400 });
  }
  if (!seed) return NextResponse.json({ error: "styleSeed required" }, { status: 400 });
  if (!archetype) return NextResponse.json({ error: "archetype required" }, { status: 400 });
  if (FIGHTER_INFT_ADDRESS === "") {
    return NextResponse.json(
      { error: "YapFighter address not configured" },
      { status: 503 },
    );
  }

  const bypassFineTune = process.env.ZG_FINE_TUNE_BYPASS === "true";

  try {
    const tStart = Date.now();
    const log = (msg: string) =>
      console.log(`[mint +${Date.now() - tStart}ms] ${msg}`);

    // 1. Upload raw seed (dataset for fine-tune + auditable fingerprint).
    log("upload seed start");
    const seedBytes = new TextEncoder().encode(seed);
    const seedUpload = await uploadBuffer(seedBytes);
    log(`upload seed done — root=${seedUpload.rootHash.slice(0, 12)}`);

    // 2. Produce weightsBytes — either via real fine-tune or bypass fallback.
    let weightsBytes: Uint8Array = seedBytes;
    let fineTuneTaskId: string | null = null;
    let fineTuneProvider: string | null = null;
    let attestationSig: string | undefined;
    if (!bypassFineTune) {
      log("fineTune start");
      const ft = await fineTune({
        datasetHash: seedUpload.rootHash,
        baseModel,
      });
      log(`fineTune done — task=${ft.taskId.slice(0, 8)} weights=${ft.weightsBytes.byteLength}B`);
      weightsBytes = ft.weightsBytes;
      fineTuneTaskId = ft.taskId;
      fineTuneProvider = ft.providerAddress;
      attestationSig = ft.attestationSig;
    }

    // 3. Encrypt final weights payload with a fresh AES-GCM key.
    log("encrypt weights start");
    const { ciphertext, key, iv } = await encryptWithRandomKey(weightsBytes);
    log(`encrypt weights done — ${ciphertext.byteLength}B`);

    // 4. Upload encrypted blob.
    log("upload weights start");
    const weightsUpload = await uploadBuffer(ciphertext);
    log(`upload weights done — root=${weightsUpload.rootHash.slice(0, 12)}`);
    const encryptedURI = `0g://${weightsUpload.rootHash}`;

    // 5. Pack iv || key as sealedKey envelope.
    const sealedKeyBytes = new Uint8Array(iv.byteLength + key.byteLength);
    sealedKeyBytes.set(iv, 0);
    sealedKeyBytes.set(key, iv.byteLength);
    const sealedKey = hexlify(sealedKeyBytes);

    // 6. metadataHash = keccak(public provenance JSON).
    const metadataHash = keccak256(
      toUtf8Bytes(
        JSON.stringify({
          name,
          archetype,
          owner,
          seedRoot: seedUpload.rootHash,
          weightsRoot: weightsUpload.rootHash,
          fineTuneTaskId,
          fineTuneProvider,
          attestationSig,
          fineTuneBypassed: bypassFineTune,
        }),
      ),
    ) as `0x${string}`;

    const signatureStyle = extractSignatureQuotes(seed);

    const payload: PrepareResponse = {
      mint: {
        to: owner,
        encryptedURI,
        metadataHash,
        sealedKey,
      },
      commit: {
        owner,
        name: name || "",
        archetype,
        avatar,
        seedRoot: seedUpload.rootHash,
        weightsRoot: weightsUpload.rootHash,
        signatureStyle,
        fineTuneBypassed: bypassFineTune,
      },
      steps: {
        seedRoot: seedUpload.rootHash,
        fineTuneTaskId,
        fineTuneProvider,
        fineTuneBypassed: bypassFineTune,
        weightsRoot: weightsUpload.rootHash,
      },
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "prepare failed";
    console.error("[api/mint]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Pick 3-5 representative lines from the JSONL style seed. Reads the
 * `completion` field (what the fighter would actually say) and samples at
 * evenly-spaced indices so long seeds don't draw only from the head.
 */
function extractSignatureQuotes(seed: string): string[] {
  if (!seed) return [];
  const lines = seed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const quotes: string[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { completion?: unknown };
      if (typeof obj.completion === "string" && obj.completion.trim()) {
        quotes.push(obj.completion.trim());
      }
    } catch {
      if (line.length > 10 && line.length < 400) quotes.push(line);
    }
  }
  if (quotes.length === 0) return [];
  const target = Math.min(5, Math.max(3, Math.ceil(quotes.length / 4)));
  if (quotes.length <= target) return quotes;
  const step = quotes.length / target;
  const picked: string[] = [];
  for (let i = 0; i < target; i++) {
    picked.push(quotes[Math.floor(i * step)]);
  }
  return picked;
}
