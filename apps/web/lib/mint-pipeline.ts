// Shared mint preparation pipeline.
//
// Seals the user's style seed — encrypt the JSONL, upload to 0G Storage,
// return the (encryptedURI, metadataHash, sealedKey) payload the client
// needs to call `YapFighter.mint(...)` from their wallet.

import "server-only";
import { keccak256, toUtf8Bytes, hexlify } from "ethers";
import { encryptWithRandomKey } from "@/lib/0g/encrypt";
import { uploadBuffer } from "@/lib/0g/storage";
import {
  setMintJobError,
  setMintJobResult,
  setMintJobStatus,
  type MintJobResult,
} from "@/lib/mint-jobs";

export interface MintPipelineArgs {
  owner: `0x${string}`;
  name: string;
  archetype: string;
  avatar: number;
  seed: string;
}

/**
 * Run the mint preparation pipeline: upload seed → encrypt seed →
 * upload encrypted blob → derive metadataHash + sealedKey. Returns the
 * payload the client signs into `YapFighter.mint(...)`.
 *
 * If `jobId` is provided, advances that job's status as each phase
 * completes and writes the final result back via setMintJobResult /
 * setMintJobError.
 */
export async function runMintPipeline(
  args: MintPipelineArgs,
  jobId?: string,
): Promise<MintJobResult> {
  const { owner, name, archetype, avatar, seed } = args;
  const tStart = Date.now();
  const log = (msg: string) =>
    console.log(`[mint${jobId ? ` ${jobId}` : ""} +${Date.now() - tStart}ms] ${msg}`);

  try {
    // 1. Upload raw seed (auditable fingerprint of the persona inputs).
    if (jobId) setMintJobStatus(jobId, "uploading-seed");
    log("upload seed start");
    const seedBytes = new TextEncoder().encode(seed);
    const seedUpload = await uploadBuffer(seedBytes);
    log(`upload seed done — root=${seedUpload.rootHash.slice(0, 12)}`);

    // 2. Encrypt the seed bytes with a fresh AES-GCM key. The persona
    //    *is* the encrypted payload — there are no separate weights to
    //    seal anymore.
    if (jobId) setMintJobStatus(jobId, "encrypting");
    log("encrypt start");
    const { ciphertext, key, iv } = await encryptWithRandomKey(seedBytes);
    log(`encrypt done — ${ciphertext.byteLength}B`);

    // 3. Upload encrypted payload.
    if (jobId) setMintJobStatus(jobId, "uploading-encrypted");
    log("upload encrypted start");
    const weightsUpload = await uploadBuffer(ciphertext);
    log(`upload encrypted done — root=${weightsUpload.rootHash.slice(0, 12)}`);
    const encryptedURI = `0g://${weightsUpload.rootHash}`;

    // 4. Pack iv || key as sealedKey envelope (ERC-7857 sealed-key shape).
    const sealedKeyBytes = new Uint8Array(iv.byteLength + key.byteLength);
    sealedKeyBytes.set(iv, 0);
    sealedKeyBytes.set(key, iv.byteLength);
    const sealedKey = hexlify(sealedKeyBytes);

    // 5. metadataHash = keccak(public provenance JSON).
    const metadataHash = keccak256(
      toUtf8Bytes(
        JSON.stringify({
          name,
          archetype,
          owner,
          seedRoot: seedUpload.rootHash,
          weightsRoot: weightsUpload.rootHash,
        }),
      ),
    ) as `0x${string}`;

    const signatureStyle = extractSignatureQuotes(seed);

    const result: MintJobResult = {
      mint: { to: owner, encryptedURI, metadataHash, sealedKey },
      commit: {
        owner,
        name: name || "",
        archetype,
        avatar,
        seedRoot: seedUpload.rootHash,
        weightsRoot: weightsUpload.rootHash,
        signatureStyle,
      },
      steps: {
        seedRoot: seedUpload.rootHash,
        weightsRoot: weightsUpload.rootHash,
      },
    };
    if (jobId) setMintJobResult(jobId, result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "mint failed";
    log(`ERROR ${message}`);
    if (jobId) setMintJobError(jobId, message);
    throw e;
  }
}

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
