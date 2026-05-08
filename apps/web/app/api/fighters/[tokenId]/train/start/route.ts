import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract } from "ethers";
import { createMintJob } from "@/lib/mint-jobs";
import { runMintPipeline } from "@/lib/mint-pipeline";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/chains";

export const runtime = "nodejs";
export const maxDuration = 30;

interface StartBody {
  owner?: `0x${string}`;
  name?: string;
  archetype?: string;
  avatar?: number;
  styleSeed?: string;
}

interface RouteParams {
  params: Promise<{ tokenId: string }>;
}

/**
 * POST /api/fighters/<tokenId>/train/start
 *
 * Continuous-learning entrypoint. Validates that the requester is the
 * current INFT owner, then runs the same prepare pipeline as mint
 * (encrypt new dataset → upload). The returned jobId is polled at
 * /api/mint/status/<id>; once `ready`, the client signs
 * `FighterTrainer.train(...)` and a new training session lands on-chain
 * as a `FighterTrained` event — the fighter's evolution timeline.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { tokenId } = await params;
  const tokenIdBig = (() => {
    try {
      return BigInt(tokenId);
    } catch {
      return null;
    }
  })();
  if (tokenIdBig === null || tokenIdBig < 0n) {
    return NextResponse.json({ error: "invalid tokenId" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as StartBody;
  const owner = body.owner;
  const seed = body.styleSeed?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const archetype = body.archetype?.trim() ?? "";
  const avatar = typeof body.avatar === "number" ? body.avatar : 0;

  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return NextResponse.json(
      { error: "valid owner address required" },
      { status: 400 },
    );
  }
  if (!seed) return NextResponse.json({ error: "styleSeed required" }, { status: 400 });
  if (!archetype) return NextResponse.json({ error: "archetype required" }, { status: 400 });
  if (FIGHTER_INFT_ADDRESS === "") {
    return NextResponse.json(
      { error: "YapFighter address not configured" },
      { status: 503 },
    );
  }

  // Verify ownership on-chain. Anyone can hit this endpoint; only the
  // actual owner should be allowed to extend a fighter's persona. The
  // on-chain FighterTrainer.train() will re-check; failing fast here
  // avoids wasting a prepare run on a request that would later revert.
  try {
    const provider = new JsonRpcProvider(activeChain.rpcUrls.default.http[0]);
    const yapFighter = new Contract(
      FIGHTER_INFT_ADDRESS as `0x${string}`,
      FIGHTER_INFT_ABI as unknown as ConstructorParameters<typeof Contract>[1],
      provider,
    );
    const onChainOwner = (await yapFighter.ownerOf(tokenIdBig)) as string;
    if (onChainOwner.toLowerCase() !== owner.toLowerCase()) {
      return NextResponse.json(
        { error: "not the current owner of this fighter" },
        { status: 403 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ownership check failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const job = createMintJob();

  runMintPipeline(
    { owner, name, archetype, avatar, seed },
    job.id,
  ).catch((e) => {
    console.warn(`[api/train ${tokenId}] job ${job.id} failed:`, e);
  });

  return NextResponse.json({ jobId: job.id, tokenId });
}
