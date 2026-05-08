// Shared mint pipeline used by both the legacy synchronous /api/mint
// route and the new async /api/mint/start + /api/mint/status flow.
//
// The async flow runs `runMintPipeline` as fire-and-forget against the
// in-memory mint-jobs tracker so the HTTP request returns in <2 s while
// the 9-minute fine-tune happens in the background.

import "server-only";
import { keccak256, toUtf8Bytes, hexlify } from "ethers";
import { fineTune } from "@/lib/0g/compute";
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
  baseModel?: string;
  bypassFineTune: boolean;
}

/**
 * Run the full mint preparation pipeline (seed upload → fine-tune →
 * decrypt → encrypt → weights upload → metadataHash). Returns the same
 * payload shape the synchronous route used to.
 *
 * If `jobId` is provided, advances that job's status as each phase
 * completes and writes the final result back via setMintJobResult /
 * setMintJobError.
 */
export async function runMintPipeline(
  args: MintPipelineArgs,
  jobId?: string,
): Promise<MintJobResult> {
  const { owner, name, archetype, avatar, seed, baseModel, bypassFineTune } = args;
  const tStart = Date.now();
  const log = (msg: string) =>
    console.log(`[mint${jobId ? ` ${jobId}` : ""} +${Date.now() - tStart}ms] ${msg}`);

  try {
    // 1. Upload raw seed.
    if (jobId) setMintJobStatus(jobId, "uploading-seed");
    log("upload seed start");
    const seedBytes = new TextEncoder().encode(seed);
    const seedUpload = await uploadBuffer(seedBytes);
    log(`upload seed done — root=${seedUpload.rootHash.slice(0, 12)}`);

    // 2. Real fine-tune (or bypass).
    let weightsBytes: Uint8Array = seedBytes;
    let fineTuneTaskId: string | null = null;
    let fineTuneProvider: string | null = null;
    let attestationSig: string | undefined;
    if (!bypassFineTune) {
      if (jobId) setMintJobStatus(jobId, "training");
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

    // 3. Encrypt weights.
    if (jobId) setMintJobStatus(jobId, "encrypting-weights");
    log("encrypt weights start");
    const { ciphertext, key, iv } = await encryptWithRandomKey(weightsBytes);
    log(`encrypt weights done — ${ciphertext.byteLength}B`);

    // 4. Upload encrypted weights.
    if (jobId) setMintJobStatus(jobId, "uploading-weights");
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
