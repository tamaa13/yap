// Server-side metadata store for minted fighters.
// The contract only persists metadataHash on-chain; plaintext name / archetype
// / avatar / signature quotes live here.
//
// Backed by Upstash KV (a Redis hash) so writes persist and are shared across
// Vercel serverless instances. The previous file-backed store (.data/
// fighters.json) is READ-ONLY at runtime on serverless: /api/fighters/commit
// writes silently vanished and the list served the stale bundled snapshot
// (instance-local at best). Falls back to the local .data file for `next dev`
// (writable FS, single process). On first KV use the hash is seeded once from
// the bundled file so existing entries aren't lost on cutover.

import "server-only";
import { Redis } from "@upstash/redis";
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
  // Off-chain listing flags (legacy UI counts; chain wins via getListing).
  forSale?: boolean;
  price?: number;
  forRent?: boolean;
  rentPrice?: number;
  listedAt?: number;
  /** 3-5 representative lines extracted from the style seed at mint time. */
  signatureStyle?: string[];
}

const HKEY = "fighter:meta";
const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "fighters.json");

function getRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// One-time seed of the KV hash from the bundled file, so the cutover doesn't
// drop the existing roster. Idempotent (skips when the hash already has data);
// the per-instance flag keeps it to a single HLEN check after the first call.
let seedChecked = false;
async function seedFromFileIfEmpty(r: Redis): Promise<void> {
  if (seedChecked) return;
  seedChecked = true;
  try {
    if ((await r.hlen(HKEY)) > 0) return;
    const map = JSON.parse(await fs.readFile(STORE_PATH, "utf8")) as Record<
      string,
      FighterMeta
    >;
    if (Object.keys(map).length > 0) await r.hset(HKEY, map);
  } catch {
    /* no bundled file / unreadable — start empty */
  }
}

// --- local-dev file fallback (no KV configured) ---
async function fileLoad(): Promise<Record<string, FighterMeta>> {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, "utf8")) as Record<
      string,
      FighterMeta
    >;
  } catch {
    return {};
  }
}
async function fileSave(map: Record<string, FighterMeta>): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(STORE_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function saveFighterMeta(meta: FighterMeta): Promise<void> {
  const r = getRedis();
  if (r) {
    await seedFromFileIfEmpty(r);
    await r.hset(HKEY, { [String(meta.tokenId)]: meta });
    return;
  }
  const all = await fileLoad();
  all[String(meta.tokenId)] = meta;
  await fileSave(all);
}

export async function getFighterMeta(
  tokenId: number,
): Promise<FighterMeta | null> {
  const r = getRedis();
  if (r) {
    await seedFromFileIfEmpty(r);
    return ((await r.hget(HKEY, String(tokenId))) as FighterMeta | null) ?? null;
  }
  return (await fileLoad())[String(tokenId)] ?? null;
}

export async function updateFighterMeta(
  tokenId: number,
  patch: Partial<FighterMeta>,
): Promise<FighterMeta | null> {
  const current = await getFighterMeta(tokenId);
  if (!current) return null;
  const next = { ...current, ...patch, tokenId };
  await saveFighterMeta(next);
  return next;
}

export async function listFighterMetas(owner?: string): Promise<FighterMeta[]> {
  const r = getRedis();
  let all: Record<string, FighterMeta>;
  if (r) {
    await seedFromFileIfEmpty(r);
    all = ((await r.hgetall(HKEY)) as Record<string, FighterMeta> | null) ?? {};
  } else {
    all = await fileLoad();
  }
  const arr = Object.values(all);
  if (owner) {
    const lc = owner.toLowerCase();
    return arr.filter((m) => m.owner.toLowerCase() === lc);
  }
  return arr.sort((a, b) => b.mintedAt - a.mintedAt);
}
