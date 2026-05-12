// POST /api/mint/score
//
// Server-side persona scoring endpoint. Pre-Phase-4 this returns a
// `ScoredAttestation`-shaped payload populated with heuristic mock
// scores via `lib/stylometry/mock-scores.ts`, so the mint UI can render
// the score-first → archetype-second flow without waiting for the TEE
// round-trip. Phase 4 swaps the body for a call to
// `lib/0g/score-persona.ts:scorePersona({...})` — the response contract
// stays identical so the FE is already correct.
//
// Why a route (vs deriving on the client):
//   - When the real scoring fires it MUST be server-side: the broker key,
//     RUNNER_PRIVATE_KEY, and TEE signature lookups all live in
//     process.env. Mint page can't hold them.
//   - Locks the contract surface today so Phase 4's swap is one
//     `await scorePersona(...)` call inside this handler.

import { NextResponse } from "next/server";
import { sha256, stringToBytes } from "viem";
import { deriveMockScores } from "@/lib/stylometry/mock-scores";

export const runtime = "nodejs";

interface Body {
  seed?: string;
  /** Optional. Used by Phase 4 to build the canonical text; mock path
   *  echoes the value back without committing on-chain. */
  tokenId?: number;
  /** Optional. Same — Phase 4 inlines into canonical text. */
  fighterAddr?: `0x${string}`;
  /** Optional. Defaults to the active chain id when Phase 4 wires. */
  chainId?: number;
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

  // Pre-Phase-4 mock path. Phase 4 replaces this block with:
  //   const attestation = await scorePersona({
  //     providerAddress: process.env.ZG_COMPUTE_PROVIDER,
  //     seed, tokenId, fighterAddr, chainId,
  //   });
  //   return NextResponse.json({ ...attestation, mode: "live" });
  const scores = deriveMockScores(seed);
  const seedHash = sha256(stringToBytes(seed));

  return NextResponse.json({
    mode: "mock",
    scores: {
      logos: scores.logos,
      rhetoric: scores.rhetoric,
      aggression: scores.aggression,
      range: scores.range,
      concreteness: scores.concreteness,
    },
    seedHash,
    // Placeholders. Phase 4 fills with the real TEE bundle.
    canonicalText: null,
    contentOffset: null,
    signedText: null,
    teeSignature: null,
    providerAddress: null,
    judgeTrail: null,
  });
}
