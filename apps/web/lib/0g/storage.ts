// Server-only wrappers around the 0G Storage SDK.
// Requires `ZG_SERVER_PRIVATE_KEY` to sign the Flow-contract submissions the
// Indexer issues on upload. Never import from a client component.

import "server-only";
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { JsonRpcProvider, Wallet, keccak256 } from "ethers";
import { activeChain } from "@/lib/chains";

// Bypass: skip the on-chain flow submission and synthesize a content-hash root.
// Useful when the testnet flow contract is misbehaving (e.g. estimateGas reverts
// with no data) but we still want to exercise the rest of the pipeline.
const BYPASS = process.env.ZG_STORAGE_BYPASS === "true";

const INDEXER_URL =
  process.env.ZG_STORAGE_INDEXER ??
  (process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? "https://indexer-storage-turbo.0g.ai"
    : "https://indexer-storage-testnet-turbo.0g.ai");

const RPC = activeChain.rpcUrls.default.http[0];

function getSigner() {
  const pk = process.env.ZG_SERVER_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "ZG_SERVER_PRIVATE_KEY is not set. 0G Storage uploads require a funded signer.",
    );
  }
  const provider = new JsonRpcProvider(RPC);
  return new Wallet(pk, provider);
}

export interface UploadResult {
  rootHash: string;
  txHash: string | null;
}

/**
 * Upload a buffer to 0G Storage. Returns the content root hash and submission
 * tx hash. Idempotent: re-uploading identical bytes returns the same root hash
 * and the Indexer detects the duplicate and skips the on-chain submission.
 */
export async function uploadBuffer(bytes: Uint8Array): Promise<UploadResult> {
  if (BYPASS) {
    // Mock: root hash = keccak256(bytes), no on-chain submission.
    const rootHash = keccak256(bytes);
    console.log(
      `[0g/storage] BYPASS: mock rootHash=${rootHash} for ${bytes.byteLength} bytes`,
    );
    return { rootHash, txHash: null };
  }
  const signer = getSigner();
  const indexer = new Indexer(INDEXER_URL);

  const mem = new MemData(Array.from(bytes));
  const [tree, treeErr] = await mem.merkleTree();
  if (treeErr !== null || tree === null) {
    throw treeErr ?? new Error("merkleTree failed");
  }
  const rootHash = tree.rootHash();
  if (!rootHash) throw new Error("empty root hash");

  // sdk signature: upload(file, rpc, signer, uploadOpts?, retryOpts?, opts?)
  // return shape shifted between versions — handle tuple + object + string.
  // Signer type in the sdk is bound to ethers' CJS bundle; our Wallet comes
  // from the ESM bundle. Runtime is identical — cast to appease the checker.
  //
  // skipTx: true makes upload idempotent — if the rootHash already exists on
  // the storage network (e.g. from a prior retry), skip the on-chain submit
  // tx (which the flow contract rejects as duplicate) and just re-seed chunks.
  const uploadOpts = {
    tags: "0x",
    finalityRequired: true,
    taskSize: 10,
    expectedReplica: 1,
    skipTx: true,
    fee: BigInt(0),
  };
  const raw = (await indexer.upload(
    mem,
    RPC,
    signer as unknown as Parameters<typeof indexer.upload>[2],
    uploadOpts as unknown as Parameters<typeof indexer.upload>[3],
  )) as unknown;
  let txHash: string | null = null;
  if (Array.isArray(raw)) {
    const [result, err] = raw as [unknown, Error | null];
    if (err) throw err;
    if (typeof result === "string") txHash = result;
    else if (result && typeof result === "object" && "txHash" in result) {
      txHash = (result as { txHash: string }).txHash;
    }
  } else if (typeof raw === "string") {
    txHash = raw;
  } else if (raw && typeof raw === "object" && "txHash" in raw) {
    txHash = (raw as { txHash: string }).txHash;
  }

  return { rootHash, txHash };
}

export { INDEXER_URL, RPC };
