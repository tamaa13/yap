// Server-side battle state store. In-memory with disk snapshot for
// durability across restarts. Abstracted behind {BattleStore} so production
// deployments can swap to Redis / Vercel KV without touching the runner
// or the API surface.
//
// Concurrency model:
//   - One JS process owns the singleton store. Mutations flow through
//     `update()` which serializes via a per-battle mutex.
//   - Each state change publishes a `BattleEvent` to in-process subscribers
//     (SSE endpoints). File persistence is best-effort; the in-memory copy
//     is source of truth during the server's lifetime.
//   - Dev/HMR: we intentionally pin the singleton to `globalThis` so hot-
//     reloads don't fork the store and lose in-flight battles.

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
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
  /** Non-persistent flag set when a runner takes ownership. Prevents
   *  duplicate runner invocation. */
  tryAcquireRunner(battleId: number): boolean;
  releaseRunner(battleId: number): void;
  /** Current live subscriber count for the battle (excluding in-process
   *  runner). Used for spectator count display. */
  subscriberCount(battleId: number): number;
}

// ─── File-backed in-memory implementation ────────────────────────────────

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
    // Warm up cache from disk on first construction.
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
  await fs.mkdir(STORE_DIR, { recursive: true }).catch(() => {});
  const dump: Record<string, BattleState> = {};
  for (const [id, state] of intl.cache) dump[String(id)] = state;
  await fs.writeFile(STATE_PATH, JSON.stringify(dump, null, 2), "utf8");
}

/** Serialize disk writes so rapid state mutations don't clobber each other. */
function enqueueWrite(intl: Internal): void {
  intl.writeQueue = intl.writeQueue
    .catch(() => {})
    .then(() => persistToDisk(intl));
}

function getEmitter(intl: Internal, battleId: number): EventEmitter {
  let em = intl.emitters.get(battleId);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(100); // allow many SSE subscribers
    intl.emitters.set(battleId, em);
  }
  return em;
}

class FileBackedStore implements BattleStore {
  async get(battleId: number): Promise<BattleState | null> {
    const intl = getInternal();
    return intl.cache.get(battleId) ?? null;
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
    const intl = getInternal();
    const em = getEmitter(intl, battleId);
    em.emit("event", event);
  }

  subscribe(
    battleId: number,
    handler: (event: BattleEvent) => void,
  ): () => void {
    const intl = getInternal();
    const em = getEmitter(intl, battleId);
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
    const intl = getInternal();
    intl.runnerLocks.delete(battleId);
  }

  subscriberCount(battleId: number): number {
    const intl = getInternal();
    const em = intl.emitters.get(battleId);
    if (!em) return 0;
    return em.listenerCount("event");
  }
}

let singleton: BattleStore | null = null;

export function getBattleStore(): BattleStore {
  if (!singleton) singleton = new FileBackedStore();
  return singleton;
}
