import { NextResponse } from "next/server";
import { keccak256, toUtf8Bytes, hexlify, AbiCoder } from "ethers";
import { encryptWithRandomKey } from "@/lib/0g/encrypt";
import { uploadBuffer } from "@/lib/0g/storage";
import { getBattleStore } from "@/lib/battle-state/store";
import { MOMENT_INFT_ADDRESS } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PrepareBody {
  battleId?: number;
  roundNo?: number;
  side?: "a" | "b" | 0 | 1;
}

interface PrepareResponse {
  /** Params to pass to MomentINFT.mintMoment(...) on-chain. */
  mint: {
    battleId: number;
    roundNo: number;
    side: number; // 0 = fighter A, 1 = fighter B
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
    provenanceHash: `0x${string}`;
  };
  /** Off-chain context the client/UI may want to display while signing. */
  context: {
    fighterTokenId: number;
    transcriptPreview: string;
    transcriptByteLength: number;
  };
}

/**
 * POST /api/moments/prepare
 *
 * Input: { battleId, roundNo, side: "a"|"b" | 0|1 }
 *
 * Reads the live battle state for the requested round, plucks the
 * fighter's argument bytes, encrypts them under a fresh AES key, pins
 * the ciphertext to 0G Storage, and returns the (encryptedURI,
 * metadataHash, sealedKey, provenanceHash) tuple the client will sign
 * into MomentINFT.mintMoment(...).
 *
 * Settlement is required before the mint can land on-chain (the contract
 * enforces it), but the prepare itself works on any settled or in-flight
 * round. The dedup is on-chain — the client/UI checks `momentClaimed`
 * before calling prepare to avoid pointless storage uploads.
 *
 * provenanceHash = keccak(battleId, roundNo, side, transcript bytes)
 * — anchors the minted token back to a specific round's plaintext so
 * spectators can verify the moment matches what actually happened.
 */
export async function POST(req: Request) {
  if (MOMENT_INFT_ADDRESS === "") {
    return NextResponse.json(
      { error: "MomentINFT address not configured for this network" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PrepareBody;
  const battleId = typeof body.battleId === "number" ? body.battleId : NaN;
  const roundNo = typeof body.roundNo === "number" ? body.roundNo : NaN;
  const sideRaw = body.side;
  const sideNum =
    sideRaw === "a" || sideRaw === 0
      ? 0
      : sideRaw === "b" || sideRaw === 1
        ? 1
        : -1;

  if (!Number.isFinite(battleId) || battleId <= 0) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }
  if (!Number.isFinite(roundNo) || roundNo <= 0) {
    return NextResponse.json({ error: "roundNo required" }, { status: 400 });
  }
  if (sideNum !== 0 && sideNum !== 1) {
    return NextResponse.json({ error: "side must be 'a' or 'b'" }, { status: 400 });
  }

  const store = getBattleStore();
  const state = await store.get(battleId);
  if (!state) {
    return NextResponse.json(
      { error: "battle state not found — runner may have GC'd it" },
      { status: 404 },
    );
  }
  const round = state.rounds.find((r) => r.number === roundNo);
  if (!round) {
    return NextResponse.json(
      { error: `round ${roundNo} not found in battle state` },
      { status: 404 },
    );
  }
  const argument = sideNum === 0 ? round.argumentA : round.argumentB;
  if (!argument.content) {
    return NextResponse.json(
      { error: "round argument has no content yet" },
      { status: 409 },
    );
  }

  const fighterTokenId =
    sideNum === 0 ? state.fighterA.id : state.fighterB.id;

  try {
    const tStart = Date.now();
    const log = (msg: string) =>
      console.log(`[moments/prepare ${battleId}/${roundNo}/${sideNum} +${Date.now() - tStart}ms] ${msg}`);

    // Build the public moment payload (transcript + minimal context).
    // Encrypted on the client's behalf so collectors are gated by sealed key.
    const transcriptText = JSON.stringify({
      battleId,
      topic: state.topic,
      roundNo,
      side: sideNum === 0 ? "a" : "b",
      fighterTokenId,
      fighterName:
        sideNum === 0 ? state.fighterA.name : state.fighterB.name,
      content: argument.content,
      tokenCount: argument.tokenCount,
      chatID: argument.chatID ?? null,
      sigValid: argument.sigValid ?? null,
      mintedAt: Date.now(),
    });
    const transcriptBytes = new TextEncoder().encode(transcriptText);

    log("encrypt start");
    const { ciphertext, key, iv } = await encryptWithRandomKey(transcriptBytes);
    log(`encrypt done — ${ciphertext.byteLength}B`);

    log("upload start");
    const upload = await uploadBuffer(ciphertext);
    log(`upload done — root=${upload.rootHash.slice(0, 12)}`);
    const encryptedURI = `0g://${upload.rootHash}`;

    const sealedKeyBytes = new Uint8Array(iv.byteLength + key.byteLength);
    sealedKeyBytes.set(iv, 0);
    sealedKeyBytes.set(key, iv.byteLength);
    const sealedKey = hexlify(sealedKeyBytes);

    // metadataHash = keccak(public provenance JSON). Mirrors the YapFighter
    // mint pattern so collectors can independently verify the minted token
    // references real on-chain context.
    const metadataHash = keccak256(
      toUtf8Bytes(
        JSON.stringify({
          kind: "yap.moment.v1",
          battleId,
          roundNo,
          side: sideNum,
          fighterTokenId,
          weightsRoot: upload.rootHash,
        }),
      ),
    ) as `0x${string}`;

    // provenanceHash anchors the moment to the exact transcript bytes.
    // Encoded as keccak(abi.encode(uint256, uint16, uint8, bytes)) so the
    // collector / verifier can replay it from the upload.
    const provenanceHash = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint16", "uint8", "bytes"],
        [battleId, roundNo, sideNum, transcriptBytes],
      ),
    ) as `0x${string}`;

    const payload: PrepareResponse = {
      mint: {
        battleId,
        roundNo,
        side: sideNum,
        encryptedURI,
        metadataHash,
        sealedKey,
        provenanceHash,
      },
      context: {
        fighterTokenId,
        transcriptPreview: argument.content.slice(0, 240),
        transcriptByteLength: transcriptBytes.byteLength,
      },
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "prepare failed";
    console.error("[api/moments/prepare]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
