import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract, type Log } from "ethers";
import { RPC } from "@/lib/0g/storage";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { saveFighterMeta } from "@/lib/fighter-meta";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CommitBody {
  txHash?: string;
  owner?: `0x${string}`;
  name?: string;
  archetype?: string;
  avatar?: number;
  seedRoot?: string;
  weightsRoot?: string;
  signatureStyle?: string[];
}

/**
 * POST /api/fighters/commit
 *
 * Called by the client immediately after the user's mint tx is confirmed.
 * Parses the `Minted(tokenId, to, metadataHash, encryptedURI)` event from
 * the receipt to resolve tokenId authoritatively (we don't trust client-
 * supplied tokenIds), then persists the plaintext fighter meta that the
 * contract doesn't store on-chain (name, archetype, avatar, signature quotes).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CommitBody;
  const txHash = body.txHash;
  const owner = body.owner;

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "valid txHash required" }, { status: 400 });
  }
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return NextResponse.json({ error: "valid owner required" }, { status: 400 });
  }
  if (!body.archetype) {
    return NextResponse.json({ error: "archetype required" }, { status: 400 });
  }
  if (FIGHTER_INFT_ADDRESS === "") {
    return NextResponse.json(
      { error: "YapFighter address not configured" },
      { status: 503 },
    );
  }

  try {
    const provider = new JsonRpcProvider(RPC);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return NextResponse.json({ error: "tx not yet mined" }, { status: 404 });
    }
    if (receipt.status !== 1) {
      return NextResponse.json({ error: "tx reverted" }, { status: 400 });
    }

    const fighter = new Contract(
      FIGHTER_INFT_ADDRESS,
      FIGHTER_INFT_ABI as unknown as string[],
      provider,
    );

    let tokenId = 0;
    let mintedTo: string | null = null;
    for (const log of receipt.logs as Log[]) {
      if (log.address.toLowerCase() !== FIGHTER_INFT_ADDRESS.toLowerCase()) continue;
      try {
        const parsed = fighter.interface.parseLog({
          topics: Array.from(log.topics) as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "Minted") {
          tokenId = Number(parsed.args.tokenId);
          mintedTo = String(parsed.args.to);
          break;
        }
      } catch {}
    }

    if (!tokenId || !mintedTo) {
      return NextResponse.json({ error: "Minted event not found in tx" }, { status: 400 });
    }
    if (mintedTo.toLowerCase() !== owner.toLowerCase()) {
      return NextResponse.json(
        { error: "tx mint recipient doesn't match commit owner" },
        { status: 400 },
      );
    }

    await saveFighterMeta({
      tokenId,
      name: body.name?.trim() || `Fighter #${tokenId}`,
      archetype: body.archetype,
      avatar: body.avatar ?? 0,
      owner,
      seedRoot: body.seedRoot,
      weightsRoot: body.weightsRoot,
      txHash,
      mintedAt: Date.now(),
      signatureStyle: body.signatureStyle ?? [],
    });

    return NextResponse.json({ tokenId, txHash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "commit failed";
    console.error("[api/fighters/commit]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
