// Server-side battle state store. Two implementations behind one interface:
//
//   - InMemoryBattleStore — single-process, EventEmitter-based pub/sub +
//     `.data/` JSON snapshot. Used for local `next dev` (no Redis required).
//
//   - RedisBattleStore — Upstash Redis KV for state, Redis Streams for the
//     event bus. Required for Vercel/serverless deployments where each
//     function invocation runs in its own process and `globalThis` won't
//     fan out tokens across SSE subscribers.
//
// Selection: if `KV_REST_API_URL` (Vercel-managed Redis) or `UPSTASH_REDIS_REST_URL`
// is set, RedisBattleStore is used. Otherwise InMemoryBattleStore.
//
// Concurrency model:
//   - Mutations flow through `update()` which serializes via per-battle lock
//     (in-memory: Map mutex; Redis: SETNX-style with TTL fallback).
//   - Each state change publishes a `BattleEvent` to all subscribers.
//   - Runner ownership lock prevents duplicate runner invocation across
//     instances.

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Redis } from "@upstash/redis";
import type { BattleEvent, BattleState } from "./types";

export interface BattleStore {
  get(battleId: number): Promise<BattleState | null>;
  set(battleId: number, state: BattleState): Promise<BattleState>;
  update(
    battleId: number,
    mutator: (prev: BattleState) => BattleState,
  ): Promise<BattleState>;
  publish(battleId: number, event: BattleEvent): void;
  subscribe(
    battleId: number,
    handler: (event: BattleEvent) => void,
  ): () => void;
  /** Acquire exclusive runner ownership. Returns true if granted. */
  tryAcquireRunner(battleId: number): Promise<boolean> | boolean;
  releaseRunner(battleId: number): Promise<void> | void;
  /** Current live subscriber count (excluding runner). */
  subscriberCount(battleId: number): Promise<number> | number;
}

// ─── In-memory implementation (dev) ──────────────────────────────────────

interface Internal {
  cache: Map<number, BattleState>;
  emitters: Map<number, EventEmitter>;
  runnerLocks: Set<number>;
  writeQueue: Promise<void>;
}

const STORE_DIR = path.join(process.cwd(), ".data");
const STATE_PATH = path.join(STORE_DIR, "battle-state.json");

function getInternal(): Internal {
  const g = globalThis as unknown as { __yapBattleStore?: Internal };
  if (!g.__yapBattleStore) {
    g.__yapBattleStore = {
      cache: new Map(),
      emitters: new Map(),
      runnerLocks: new Set(),
      writeQueue: Promise.resolve(),
    };
    void loadFromDisk(g.__yapBattleStore);
  }
  return g.__yapBattleStore;
}

async function loadFromDisk(intl: Internal): Promise<void> {
  try {
    const text = await fs.readFile(STATE_PATH, "utf8");
    const obj = JSON.parse(text) as Record<string, BattleState>;
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k);
      if (Number.isFinite(id)) intl.cache.set(id, v);
    }
  } catch {
    // File missing or corrupt — start fresh.
  }
}

async function persistToDisk(intl: Internal): Promise<void> {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const dump: Record<string, BattleState> = {};
    for (const [id, state] of intl.cache) dump[String(id)] = state;
    await fs.writeFile(STATE_PATH, JSON.stringify(dump, null, 2), "utf8");
  } catch {
    // Read-only FS (Vercel etc). Caller should be using RedisBattleStore.
  }
}

function enqueueWrite(intl: Internal): void {
  intl.writeQueue = intl.writeQueue
    .catch(() => {})
    .then(() => persistToDisk(intl));
}

function getEmitter(intl: Internal, battleId: number): EventEmitter {
  let em = intl.emitters.get(battleId);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(100);
    intl.emitters.set(battleId, em);
  }
  return em;
}

class InMemoryBattleStore implements BattleStore {
  async get(battleId: number): Promise<BattleState | null> {
    return getInternal().cache.get(battleId) ?? null;
  }

  async set(battleId: number, state: BattleState): Promise<BattleState> {
    const intl = getInternal();
    const stamped = { ...state, updatedAt: Date.now() };
    intl.cache.set(battleId, stamped);
    enqueueWrite(intl);
    this.publish(battleId, { type: "snapshot", state: stamped });
    return stamped;
  }

  async update(
    battleId: number,
    mutator: (prev: BattleState) => BattleState,
  ): Promise<BattleState> {
    const intl = getInternal();
    const prev = intl.cache.get(battleId);
    if (!prev) throw new Error(`battle ${battleId} not in store`);
    const next = { ...mutator(prev), updatedAt: Date.now() };
    intl.cache.set(battleId, next);
    enqueueWrite(intl);
    return next;
  }

  publish(battleId: number, event: BattleEvent): void {
    const em = getEmitter(getInternal(), battleId);
    em.emit("event", event);
  }

  subscribe(
    battleId: number,
    handler: (event: BattleEvent) => void,
  ): () => void {
    const em = getEmitter(getInternal(), battleId);
    em.on("event", handler);
    return () => em.off("event", handler);
  }

  tryAcquireRunner(battleId: number): boolean {
    const intl = getInternal();
    if (intl.runnerLocks.has(battleId)) return false;
    intl.runnerLocks.add(battleId);
    return true;
  }

  releaseRunner(battleId: number): void {
    getInternal().runnerLocks.delete(battleId);
  }

  subscriberCount(battleId: number): number {
    const em = getInternal().emitters.get(battleId);
    if (!em) return 0;
    return em.listenerCount("event");
  }
}

// ─── Redis implementation (Vercel/production) ────────────────────────────
//
// Schema:
//   yap:battle:{id}:state    SET       JSON-stringified BattleState
//   yap:battle:{id}:events   STREAM    BattleEvent JSONs (XADD / XREAD)
//   yap:battle:{id}:lock     SETNX     Runner ownership marker
//   yap:battle:{id}:subs     ZSET      Subscriber-id → last-heartbeat ms
//
// Subscriber count uses ZSET with last-seen timestamp; entries older than
// SUBSCRIBER_TTL_MS are pruned on each count call. Each SSE handler bumps
// its score every SUBSCRIBER_HEARTBEAT_MS.
//
// `subscribe()` polls the stream via XREAD with BLOCK so the function
// stays parked waiting for events without burning CPU.

const REDIS_KEY_PREFIX = "yap:battle:";
const STREAM_MAXLEN = 5_000; // approx cap on per-battle stream length
const RUNNER_LOCK_TTL_S = 30 * 60; // 30 min — covers full battle duration
const SUBSCRIBER_TTL_MS = 15_000;
const SUBSCRIBER_HEARTBEAT_MS = 5_000;
// Upstash REST does not support BLOCK xread, so the subscribe loop polls.
// 400ms keeps token streaming feel-responsive without thrashing the API.
const STREAM_POLL_MS = 400;

function stateKey(battleId: number): string {
  return `${REDIS_KEY_PREFIX}${battleId}:state`;
}
function eventsKey(battleId: number): string {
  return `${REDIS_KEY_PREFIX}${battleId}:events`;
}
function lockKey(battleId: number): string {
  return `${REDIS_KEY_PREFIX}${battleId}:lock`;
}
function subsKey(battleId: number): string {
  return `${REDIS_KEY_PREFIX}${battleId}:subs`;
}

class RedisBattleStore implements BattleStore {
  private redis: Redis;
  /** Maps subscriber-id (random) → battle id, so unsubscribe knows what to clean. */
  private subRegistry = new Map<string, { battleId: number; cancelled: boolean }>();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(battleId: number): Promise<BattleState | null> {
    const raw = await this.redis.get<BattleState>(stateKey(battleId));
    return raw ?? null;
  }

  async set(battleId: number, state: BattleState): Promise<BattleState> {
    const stamped = { ...state, updatedAt: Date.now() };
    await this.redis.set(stateKey(battleId), stamped);
    await this.publishToStream(battleId, { type: "snapshot", state: stamped });
    return stamped;
  }

  async update(
    battleId: number,
    mutator: (prev: BattleState) => BattleState,
  ): Promise<BattleState> {
    // Note: not a CAS — concurrent updates within ~50ms could overlap. The
    // runner is the only writer in practice (subscribers are read-only),
    // so this is acceptable for hackathon scope.
    const prev = await this.get(battleId);
    if (!prev) throw new Error(`battle ${battleId} not in store`);
    const next = { ...mutator(prev), updatedAt: Date.now() };
    await this.redis.set(stateKey(battleId), next);
    return next;
  }

  publish(battleId: number, event: BattleEvent): void {
    // Fire-and-forget — Redis Stream XADD is fast but we don't want to
    // block the runner's hot loop on network I/O.
    void this.publishToStream(battleId, event);
  }

  private async publishToStream(
    battleId: number,
    event: BattleEvent,
  ): Promise<void> {
    try {
      await this.redis.xadd(
        eventsKey(battleId),
        "*",
        { data: JSON.stringify(event) },
        { trim: { type: "MAXLEN", threshold: STREAM_MAXLEN, comparison: "~" } },
      );
    } catch (e) {
      console.error(`[battle-store] xadd failed for ${battleId}:`, e);
    }
  }

  subscribe(
    battleId: number,
    handler: (event: BattleEvent) => void,
  ): () => void {
    const subId = crypto.randomUUID();
    const ctx = { battleId, cancelled: false };
    this.subRegistry.set(subId, ctx);

    // Bump subscriber heartbeat into the ZSET.
    const heartbeat = setInterval(() => {
      void this.redis.zadd(subsKey(battleId), {
        score: Date.now(),
        member: subId,
      });
    }, SUBSCRIBER_HEARTBEAT_MS);
    void this.redis.zadd(subsKey(battleId), {
      score: Date.now(),
      member: subId,
    });

    // Polling loop: Upstash REST has no BLOCK xread, so we tick every
    // STREAM_POLL_MS and pass the cursor forward.
    let lastId = "$"; // first read returns nothing; subsequent reads advance
    void (async () => {
      while (!ctx.cancelled) {
        try {
          const raw = (await this.redis.xread(
            eventsKey(battleId),
            lastId,
            { count: 100 },
          )) as unknown;
          for (const entry of parseXreadEntries(raw)) {
            lastId = entry.id;
            try {
              const event = JSON.parse(entry.data) as BattleEvent;
              if (!ctx.cancelled) handler(event);
            } catch {
              // malformed frame — skip
            }
          }
        } catch (e) {
          console.error(`[battle-store] xread failed for ${battleId}:`, e);
        }
        // Switch from "$" (= "from now") to last seen id once we've ticked once.
        if (lastId === "$") lastId = "0-0";
        await new Promise((r) => setTimeout(r, STREAM_POLL_MS));
      }
    })();

    return () => {
      ctx.cancelled = true;
      clearInterval(heartbeat);
      this.subRegistry.delete(subId);
      void this.redis.zrem(subsKey(battleId), subId);
    };
  }

  async tryAcquireRunner(battleId: number): Promise<boolean> {
    const result = await this.redis.set(lockKey(battleId), "1", {
      nx: true,
      ex: RUNNER_LOCK_TTL_S,
    });
    return result === "OK";
  }

  async releaseRunner(battleId: number): Promise<void> {
    await this.redis.del(lockKey(battleId));
  }

  async subscriberCount(battleId: number): Promise<number> {
    const cutoff = Date.now() - SUBSCRIBER_TTL_MS;
    // Lazy GC: prune entries older than cutoff before counting.
    await this.redis.zremrangebyscore(subsKey(battleId), 0, cutoff);
    return await this.redis.zcard(subsKey(battleId));
  }
}

/**
 * Upstash xread returns either array-of-arrays (Redis RESP form) or an
 * object form depending on REST settings. Parse defensively into a uniform
 * `{id, data}[]`. Empty / null results return an empty array.
 */
function parseXreadEntries(raw: unknown): Array<{ id: string; data: string }> {
  if (!raw) return [];
  // Object-of-streams form: { "yap:battle:42:events": [["1-0", ["data","..."]]] }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const out: Array<{ id: string; data: string }> = [];
    for (const entries of Object.values(obj)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const parsed = parseEntry(entry);
        if (parsed) out.push(parsed);
      }
    }
    return out;
  }
  // Array form: [["streamName", [["1-0", ["data","..."]]]]]
  if (Array.isArray(raw)) {
    const out: Array<{ id: string; data: string }> = [];
    for (const stream of raw) {
      if (!Array.isArray(stream) || stream.length < 2) continue;
      const entries = stream[1];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const parsed = parseEntry(entry);
        if (parsed) out.push(parsed);
      }
    }
    return out;
  }
  return [];
}

function parseEntry(entry: unknown): { id: string; data: string } | null {
  // Possible shapes:
  //   ["id", { data: "..." }]
  //   ["id", ["data", "..."]]
  //   { id: "id", fields: { data: "..." } }
  if (Array.isArray(entry) && entry.length >= 2) {
    const id = String(entry[0]);
    const fields = entry[1];
    if (Array.isArray(fields)) {
      // ["data", "...", "key2", "..."] flat pairs
      const idx = fields.indexOf("data");
      if (idx >= 0 && typeof fields[idx + 1] === "string") {
        return { id, data: fields[idx + 1] as string };
      }
    } else if (fields && typeof fields === "object") {
      const data = (fields as Record<string, unknown>).data;
      if (typeof data === "string") return { id, data };
    }
  } else if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const id = obj.id;
    const fields = obj.fields ?? obj;
    if (typeof id === "string" && fields && typeof fields === "object") {
      const data = (fields as Record<string, unknown>).data;
      if (typeof data === "string") return { id, data };
    }
  }
  return null;
}

// ─── Factory ─────────────────────────────────────────────────────────────

let singleton: BattleStore | null = null;

function buildRedisClient(): Redis | null {
  // Vercel-managed Redis via Marketplace exposes both KV_REST_API_*
  // (legacy) and UPSTASH_REDIS_REST_* (new) env conventions.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function getBattleStore(): BattleStore {
  if (singleton) return singleton;
  const redis = buildRedisClient();
  if (redis) {
    console.log("[battle-store] using RedisBattleStore");
    singleton = new RedisBattleStore(redis);
  } else {
    console.log("[battle-store] using InMemoryBattleStore (dev only)");
    singleton = new InMemoryBattleStore();
  }
  return singleton;
}
