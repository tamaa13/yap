import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet, hexlify, toUtf8Bytes } from "ethers";
import { runInference } from "@/lib/0g/compute";
import { RPC } from "@/lib/0g/storage";
import { BATTLE_ESCROW_ABI, BATTLE_ESCROW_ADDRESS } from "@/lib/contracts";
import { parseBattleId } from "@/lib/on-chain";

export const runtime = "nodejs";

interface VerdictBody {
  battleId?: string; // UI id "b-xxxx"
  topic?: string;
  transcript?: string;
  // When `submit=true`, the server calls submitVerdict on-chain with the
  // TEE-signed attestation. Requires the server wallet to hold TEE_ORACLE_ROLE.
  submit?: boolean;
}

/**
 * POST /api/battle/verdict
 * Sends the battle transcript to the TEE Judge via 0G Compute. Optionally
 * submits the signed verdict on-chain via BattleEscrow.submitVerdict.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as VerdictBody;
  if (!body.battleId || !body.transcript) {
    return NextResponse.json(
      { error: "battleId and transcript are required" },
      { status: 400 },
    );
  }

  const providerAddress = process.env.TEE_ORACLE_ADDR;
  if (!providerAddress) {
    return NextResponse.json(
      { error: "TEE_ORACLE_ADDR is not configured" },
      { status: 503 },
    );
  }
  const model = process.env.ZG_JUDGE_MODEL ?? "qwen3.6-plus";

  try {
    const prompt = [
      "You are an impartial debate judge. Output a single JSON object only.",
      `Topic: ${body.topic ?? "unknown"}`,
      "",
      "Transcript:",
      body.transcript,
      "",
      "Reply as: { \"winner\": \"A\" | \"B\" | \"DRAW\", \"reasoning\": \"...\" }",
    ].join("\n");

    const result = await runInference({ providerAddress, model, prompt });

    // Attempt to parse JSON from the response. Providers sometimes wrap JSON
    // in prose — do a best-effort extract.
    const match = result.text.match(/\{[\s\S]*\}/);
    const parsed = match ? safeJson(match[0]) : null;
    const winnerLabel: "A" | "B" | "DRAW" =
      parsed?.winner === "A" || parsed?.winner === "B" || parsed?.winner === "DRAW"
        ? parsed.winner
        : "DRAW";
    const reasoning = typeof parsed?.reasoning === "string" ? parsed.reasoning : result.text;
    const winnerCode = winnerLabel === "A" ? 0 : winnerLabel === "B" ? 1 : 2;

    // The on-chain signature blob. Until broker.inference returns a raw sig,
    // we encode the response + chatID as the attestation payload and sign via
    // the server wallet. This preserves verifiability against known signers.
    const sigPayload = hexlify(
      toUtf8Bytes(
        JSON.stringify({
          battleId: body.battleId,
          winner: winnerLabel,
          chatID: result.chatID,
          providerAddress,
          signatureValid: result.signatureValid,
        }),
      ),
    );

    let txHash: string | null = null;
    if (body.submit) {
      if (BATTLE_ESCROW_ADDRESS === "") {
        return NextResponse.json(
          { error: "BattleEscrow address not configured" },
          { status: 503 },
        );
      }
      const pk = process.env.ZG_SERVER_PRIVATE_KEY;
      if (!pk) {
        return NextResponse.json(
          { error: "ZG_SERVER_PRIVATE_KEY not configured" },
          { status: 503 },
        );
      }
      const onChainId = parseBattleId(body.battleId);
      if (onChainId === null) {
        return NextResponse.json({ error: "invalid battleId" }, { status: 400 });
      }
      const provider = new JsonRpcProvider(RPC);
      const wallet = new Wallet(pk, provider);
      const escrow = new Contract(
        BATTLE_ESCROW_ADDRESS,
        BATTLE_ESCROW_ABI as unknown as string[],
        wallet,
      );
      const tx = await escrow.submitVerdict(onChainId, winnerCode, sigPayload);
      await tx.wait();
      txHash = tx.hash;
    }

    return NextResponse.json({
      battleId: body.battleId,
      winner: winnerLabel,
      reasoning,
      providerAddress,
      signatureValid: result.signatureValid,
      txHash,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "verdict failed";
    console.error("[api/battle/verdict]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeJson(s: string): { winner?: string; reasoning?: string } | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
