import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const STORE_PATH = path.join(process.cwd(), ".data", "battle-stances.json");

async function load(): Promise<Record<string, "pro" | "con">> {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function save(map: Record<string, "pro" | "con">): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function saveBattleStance(
  battleId: number,
  side: "pro" | "con",
): Promise<void> {
  const map = await load();
  map[String(battleId)] = side;
  await save(map);
}

export async function getBattleStance(
  battleId: number,
): Promise<"pro" | "con" | null> {
  const map = await load();
  return map[String(battleId)] ?? null;
}
