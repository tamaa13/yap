// Server-only wrapper around the 0G Storage KV layer. Yap publishes the
// public-safe slice of every BattleState here after each round so the
// transcript becomes durably queryable independent of the Redis/SSE bus.
//
// Goals:
//   - 4/5 0G primitives integrated (Storage + Compute + DA + KV; Chain
//     ambient). KV gives spectators a verifiable replay surface backed by
//     0G's own infra rather than our Upstash Redis fan-out.
//   - Non-blocking: round commits never wait on KV. Failure logs warn,
//     battle proceeds.
//   - Public-only data: no encrypted persona blobs go here — those stay
//     on 0G Storage as ZgFile uploads. KV holds transcripts + state.
//
// Gate: set ZG_KV_ENABLED=true plus ZG_KV_RPC and ZG_KV_FLOW. Defaults to
// disabled so testnet ledger spend stays predictable when not demoing.

import "server-only";
import {
  Batcher,
  Indexer,
  KvClient,
  getFlowContract,
} from "@0gfoundation/0g-ts-sdk";
import {
  JsonRpcProvider,
  Wallet,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { INDEXER_URL, RPC } from "./storage";
import type { BattleState } from "@/lib/battle-state/types";

const KV_ENABLED = process.env.ZG_KV_ENABLED === "true";
const KV_RPC = process.env.ZG_KV_RPC ?? "";
const FLOW_ADDR = process.env.ZG_KV_FLOW ?? "";

// Single-stream design: every Yap battle writes under the same stream so
// any reader can paginate via KvIterator (key prefix `b:`) without
// having to mint a new stream per battle. Stream id is the keccak hash
// of a versioned namespace — bump the suffix if we ever need to migrate.
const STREAM_ID = keccak256(toUtf8Bytes("yap-battles-v1"));

const enc = new TextEncoder();

export interface BattleKvSnapshot {
  battleId: number;
  topic: string;
  challengerSide?: "pro" | "con";
  fighterA: { id: number; name: string; archetype: string };
  fighterB: { id: number; name: string; archetype: string };
  phase: BattleState["phase"];
  currentRound: number;
  maxRounds: number;
  rounds: Array<{
    number: number;
    argumentA: {
      content: string;
      tokenCount: number;
      sigValid?: boolean;
    };
    argumentB: {
      content: string;
      tokenCount: number;
      sigValid?: boolean;
    };
  }>;
  hpA: number;
  hpB: number;
  hpDamage: BattleState["hpDamage"];
  tkoAtRound?: number;
  verdict?: {
    winner: 0 | 1 | 2;
    reasoning: string;
    txHash?: string;
    settledAt: number;
  };
  updatedAt: number;
}

export function kvEnabled(): boolean {
  return (
    KV_ENABLED &&
    KV_RPC !== "" &&
    FLOW_ADDR !== "" &&
    !!process.env.ZG_BROKER_KEY
  );
}

function snapshot(state: BattleState): BattleKvSnapshot {
  return {
    battleId: state.battleId,
    topic: state.topic,
    challengerSide: state.challengerSide,
    fighterA: {
      id: state.fighterA.id,
      name: state.fighterA.name,
      archetype: state.fighterA.archetype,
    },
    fighterB: {
      id: state.fighterB.id,
      name: state.fighterB.name,
      archetype: state.fighterB.archetype,
    },
    phase: state.phase,
    currentRound: state.currentRound,
    maxRounds: state.maxRounds,
    rounds: state.rounds.map((r) => ({
      number: r.number,
      argumentA: {
        content: r.argumentA.content,
        tokenCount: r.argumentA.tokenCount,
        sigValid: r.argumentA.sigValid,
      },
      argumentB: {
        content: r.argumentB.content,
        tokenCount: r.argumentB.tokenCount,
        sigValid: r.argumentB.sigValid,
      },
    })),
    hpA: state.hpA,
    hpB: state.hpB,
    hpDamage: state.hpDamage,
    tkoAtRound: state.tkoAtRound,
    verdict: state.verdict
      ? {
          winner: state.verdict.winner,
          reasoning: state.verdict.reasoning,
          txHash: state.verdict.txHash,
          settledAt: state.verdict.settledAt,
        }
      : undefined,
    updatedAt: state.updatedAt,
  };
}

function keyFor(battleId: number): Uint8Array {
  return enc.encode(`b:${battleId}`);
}

/**
 * Append a public snapshot of the battle to 0G KV. Caller invokes via
 * `void writeBattleSnapshot(state)` — this resolves without ever throwing,
 * even on RPC flake or signer issues. Goal is "best-effort durable replay",
 * not consistency with the SSE bus.
 *
 * Cost note: every write is an on-chain Flow submission. We call this on
 * round-complete and settlement boundaries only, not per token.
 */
export async function writeBattleSnapshot(state: BattleState): Promise<void> {
  if (!kvEnabled()) return;
  try {
    const provider = new JsonRpcProvider(RPC);
    const signer = new Wallet(process.env.ZG_BROKER_KEY as string, provider);
    const indexer = new Indexer(INDEXER_URL);
    const [nodes, selectErr] = await indexer.selectNodes(1);
    if (selectErr !== null || !nodes || nodes.length === 0) {
      throw selectErr ?? new Error("no storage nodes available");
    }
    // ethers v6 Signer is structurally compatible with the SDK's ethers-v5
    // typed Signer at runtime — same interface, different declaration file.
    const flow = getFlowContract(
      FLOW_ADDR,
      signer as unknown as Parameters<typeof getFlowContract>[1],
    );
    const batcher = new Batcher(1, nodes, flow, RPC);
    batcher.streamDataBuilder.set(
      STREAM_ID,
      keyFor(state.battleId),
      enc.encode(JSON.stringify(snapshot(state))),
    );
    const [, execErr] = await batcher.exec({
      tags: "0x",
      taskSize: 10,
      expectedReplica: 1,
      skipTx: false,
      fee: BigInt(0),
    });
    if (execErr !== null) throw execErr;
  } catch (e) {
    console.warn(
      `[0g/kv] write skipped for battle ${state.battleId}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Read the most recent snapshot for {battleId}. Returns null when KV is
 * disabled, the key is missing, or any error fires. Never throws.
 *
 * Use case: spectator replay / verification surfaces that want a durable
 * read independent of the in-memory store + Redis bus.
 */
export async function readBattleSnapshot(
  battleId: number,
): Promise<BattleKvSnapshot | null> {
  if (!kvEnabled()) return null;
  try {
    const client = new KvClient(KV_RPC);
    // Cast: SDK key type is `Bytes` (from @ethersproject/bytes v5).
    // Uint8Array is structurally compatible — ArrayLike<number>.
    const val = await client.getValue(
      STREAM_ID,
      keyFor(battleId) as unknown as Parameters<typeof client.getValue>[1],
    );
    if (!val) return null;
    // Value.data is Base64-encoded bytes per SDK types. Decode → parse.
    const dataField = (val as unknown as { data?: string | Uint8Array }).data;
    if (!dataField) return null;
    const json =
      typeof dataField === "string"
        ? Buffer.from(dataField, "base64").toString("utf8")
        : new TextDecoder().decode(dataField);
    return JSON.parse(json) as BattleKvSnapshot;
  } catch (e) {
    console.warn(
      `[0g/kv] read failed for battle ${battleId}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export { STREAM_ID };
