// Pagination constants + types — shared by hooks (useFighters,
// useLeaderboard, useListings, useMyMoments, useFighterBattles) and
// the <Pagination> UI primitive. Centralized so future tweaks are atomic.
//
// v1 strategy: client-side total. Hooks fetch full list once, slice in JS.
// Works fine for testnet scope (~30 fighters, ~50 battles). When the
// catalog grows past ~5k items, swap to cursor pagination — either via
// `YapFighter.totalSupply()` if it lands in a future contract upgrade,
// or via subgraph cursors. The public hook shape ({ data, total,
// hasMore }) doesn't need to change for that migration.

/** Card-grid pages (vault tabs, marketplace tiles). 3 cols × 8 rows
 *  desktop; collapses cleanly to 2 cols × 12 rows / 1 col × 24 mobile. */
export const CARD_GRID_PAGE_SIZE = 24;

/** Dense-table pages (leaderboard, fighter battle history). */
export const TABLE_PAGE_SIZE = 50;

export interface PaginatedResult<T> {
  /** Sliced page of items. */
  data: T[];
  /** Total items across all pages (client-side count, see file header). */
  total: number;
  /** True when more items exist beyond this page. */
  hasMore: boolean;
  /** Loading state for the underlying fetch. */
  isLoading: boolean;
  /** Underlying fetch error, if any. */
  error?: Error | null;
  /** Re-fetch the source list (e.g., after a mutation). */
  refetch?: () => void;
}

export interface PaginationArgs {
  /** Page size — defaults to surface-appropriate constant when omitted. */
  limit?: number;
  /** Zero-based offset into the full list. */
  offset?: number;
}

/** Compute pagination metadata for a fully-fetched list. Used by hooks
 *  that already pull the whole catalog (testnet scale) and slice in JS. */
export function paginate<T>(
  full: T[],
  { limit, offset = 0 }: PaginationArgs,
  defaultLimit: number,
): { slice: T[]; total: number; hasMore: boolean } {
  const lim = Math.max(1, limit ?? defaultLimit);
  const off = Math.max(0, offset);
  const slice = full.slice(off, off + lim);
  return {
    slice,
    total: full.length,
    hasMore: off + lim < full.length,
  };
}

/** Read `?page=N` from URL (1-indexed; clamped to ≥1) and convert to a
 *  zero-indexed offset for the given page size. */
export function pageToOffset(page: number, pageSize: number): number {
  const p = Math.max(1, Math.floor(page) || 1);
  return (p - 1) * pageSize;
}

export function offsetToPage(offset: number, pageSize: number): number {
  return Math.max(1, Math.floor(offset / pageSize) + 1);
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
