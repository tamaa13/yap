// Phase A removed all hardcoded mock arrays. Every data source now reads from
// contracts via hooks in `/hooks/use-*`. Keep this file only as an anchor for
// cross-module imports that may still reference `getFighter` / `getBattle`;
// both now return `undefined` so callers fall back to their empty-state paths.

import type { Battle, Fighter } from "./types";

export function getFighter(_id: number): Fighter | undefined {
  return undefined;
}

export function getBattle(_id: string): Battle | undefined {
  return undefined;
}
