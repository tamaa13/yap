import { NextResponse } from "next/server";
import { listFighterMetas } from "@/lib/fighter-meta";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") ?? undefined;
  const all = await listFighterMetas(owner);
  return NextResponse.json({ fighters: all });
}
