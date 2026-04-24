// Server-side metadata store for minted fighters.
// Contract only persists metadataHash on-chain; plaintext name/archetype/avatar
// live here. File-backed JSON for simplicity — for production, swap to Redis or
// a real DB.

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export interface FighterMeta {
  tokenId: number;
  name: string;
  archetype: string;
  avatar?: number;
  owner: string;
  seedRoot?: string;
  weightsRoot?: string;
  txHash?: string;
  mintedAt: number;
  // Off-chain listing state. No marketplace contract deployed yet — these
  // flags drive UI + counts on the Marketplace tab so users can see their
  // listings appear. A real escrow contract lands in Phase B; the server
  // store will then mirror on-chain state.
  forSale?: boolean;
  price?: number;
  forRent?: boolean;
  rentPrice?: number;
  listedAt?: number;
  /** 3-5 representative lines extracted from the style seed at mint time.
   * Surfaces on the fighter detail "Overview" as signature quotes without
   * re-decrypting the on-chain weights blob. */
  signatureStyle?: string[];
}

export async function updateFighterMeta(
  tokenId: number,
  patch: Partial<FighterMeta>,
): Promise<FighterMeta | null> {
  const all = await loadAll();
  const current = all[String(tokenId)];
  if (!current) return null;
  const next = { ...current, ...patch, tokenId };
  all[String(tokenId)] = next;
  await saveAll(all);
  return next;
}

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "fighters.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true }).catch(() => {});
}

async function loadAll(): Promise<Record<string, FighterMeta>> {
  try {
    const text = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(text) as Record<string, FighterMeta>;
  } catch {
    return {};
  }
}

async function saveAll(map: Record<string, FighterMeta>): Promise<void> {
  await ensureDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function saveFighterMeta(meta: FighterMeta): Promise<void> {
  const all = await loadAll();
  all[String(meta.tokenId)] = meta;
  await saveAll(all);
}

export async function getFighterMeta(tokenId: number): Promise<FighterMeta | null> {
  const all = await loadAll();
  return all[String(tokenId)] ?? null;
}

export async function listFighterMetas(owner?: string): Promise<FighterMeta[]> {
  const all = await loadAll();
  const arr = Object.values(all);
  if (owner) {
    const lc = owner.toLowerCase();
    return arr.filter((m) => m.owner.toLowerCase() === lc);
  }
  return arr.sort((a, b) => b.mintedAt - a.mintedAt);
}
