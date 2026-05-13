// POST /api/mint/score
//
// Server-side persona scoring endpoint. Live path calls
// `lib/0g/score-persona.ts` against the 0G Compute TEE provider —
// median-of-5 LLM calls per dimension at temp=0.3 + canonical-text
// echo + provider signature. Returns the full attestation bundle
// the FE submits alongside the YapFighter mint tx.
//
// Mock-path fallback kicks in only when the broker is unconfigured
// (no `ZG_COMPUTE_PROVIDER` / `TEE_ORACLE_ADDR`) — keeps the mint UI
// previewable in dev environments without the 0G stack.
//
// Body shape:
//   { seed: string, tokenId: number, fighterAddr?: `0x${string}`,
//     chainId?: number }
//
// `fighterAddr` defaults to the FIGHTER_INFT_ADDRESS env, `chainId`
// to activeChain.id. Both are server-deterministic; callers can omit
// unless signing against a non-default address.

import { NextResponse } from "next/server";
import { sha256, stringToBytes } from "viem";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { scorePersona } from "@/lib/0g/score-persona";
import { deriveMockScores } from "@/lib/stylometry/mock-scores";

export const runtime = "nodejs";
// Persona scoring runs 5 sequential LLM calls × 3 parallel dimensions
// + canonical echo + signature fetch. Mainnet TEE latency runs ~3s
// per call vs ~1s on testnet, and a transient mainnet RPC blip
// (`dial tcp4 …:8545 failed after 0 retries`) bumps individual calls
// into the retry path. With those two factors stacked the prior 60s
// ceiling was getting hit during real UI mints. 180s gives ~3× the
// observed worst-case wall-clock without unbounded hangs. Follow-up
// fix is to parallelize the 5 samples per dimension in
// score-persona.ts:judgeDimension — that drops the LLM phase from
// 5×per-call latency to 1× and the bump becomes unnecessary.
export const maxDuration = 180;

interface Body {
  seed?: string;
  tokenId?: number;
  fighterAddr?: `0x${string}`;
  chainId?: number;
}

function liveProviderConfigured() {
  return Boolean(
    (process.env.ZG_COMPUTE_PROVIDER ?? process.env.TEE_ORACLE_ADDR) &&
      FIGHTER_INFT_ADDRESS !== "",
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const seed = body.seed?.trim();
  if (!seed) {
    return NextResponse.json(
      { error: "seed text is required" },
      { status: 400 },
    );
  }
  // `?probe=1` caps samples to 1 LLM call per dimension instead of 5.
  // Burns 3 calls + auto-funding cycles instead of 15 — same diagnostic
  // signal (raw output of each dim, broker-call trace from the
  // debug/score-persona-mainnet instrumentation), 80% lower OG burn.
  // Remove post-diagnosis. The aggregator's malformed-threshold guard
  // still trips correctly with N=1 (single-call miss → "produced no
  // parseable scores", which surfaces the raw= snippet too).
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const llmSamples = probe ? 1 : 5;

  // Mock-mode shortcut. Used in:
  //   - dev environments without ZG_COMPUTE_PROVIDER set
  //   - pre-cascade preview (FIGHTER_INFT_ADDRESS blank)
  // FE renders the score-first → archetype-second flow either way;
  // the user just doesn't get a real TEE attestation in mock mode.
  if (!liveProviderConfigured()) {
    const scores = deriveMockScores(seed);
    const seedHash = sha256(stringToBytes(seed));
    return NextResponse.json({
      mode: "mock",
      scores,
      seedHash,
      canonicalText: null,
      contentOffset: null,
      signedText: null,
      teeSignature: null,
      providerAddress: null,
      lowConfidence: false,
      judge: null,
    });
  }

  // Live TEE path. Requires tokenId because the canonical text binds
  // the score to the specific fighter the mint flow is about to mint.
  if (body.tokenId === undefined || body.tokenId === null) {
    return NextResponse.json(
      { error: "tokenId is required for live scoring" },
      { status: 400 },
    );
  }
  try {
    const attestation = await scorePersona(
      {
        providerAddress:
          process.env.ZG_COMPUTE_PROVIDER ?? process.env.TEE_ORACLE_ADDR,
        seed,
        tokenId: body.tokenId,
        fighterAddr:
          body.fighterAddr ?? (FIGHTER_INFT_ADDRESS as `0x${string}`),
        chainId: body.chainId ?? activeChain.id,
      },
      { llmSamples },
    );
    return NextResponse.json({
      mode: "live",
      scores: {
        logos: attestation.scores[0],
        rhetoric: attestation.scores[1],
        aggression: attestation.scores[2],
        range: attestation.scores[3],
        concreteness: attestation.scores[4],
      },
      seedHash: attestation.seedHash,
      canonicalText: attestation.canonicalText,
      // responseBody is a Uint8Array. JSON-encode as hex so the
      // client can re-hydrate it before signing the mint tx —
      // Uint8Array serializes as {} via JSON.stringify by default.
      responseBodyHex: `0x${Buffer.from(attestation.responseBody).toString("hex")}`,
      contentOffset: attestation.contentOffset,
      signedText: attestation.signedText,
      teeSignature: attestation.teeSignature,
      providerAddress: attestation.providerAddress,
      lowConfidence: attestation.lowConfidence,
      judge: attestation.judge,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "score-persona failed";
    console.error("[api/mint/score]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
