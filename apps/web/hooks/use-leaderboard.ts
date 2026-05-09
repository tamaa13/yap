"use client";

import { useMemo } from "react";
import { useFighters } from "./use-fighters";
import { paginate, TABLE_PAGE_SIZE } from "@/lib/pagination";
import type { Fighter } from "@/lib/types";

type Metric = "elo" | "earnings" | "volume";

interface UseLeaderboardArgs {
  metric?: Metric;
  limit?: number;
  offset?: number;
}

export function useLeaderboard({
  metric = "elo",
  limit = TABLE_PAGE_SIZE,
  offset = 0,
}: UseLeaderboardArgs = {}) {
  // Pull the full catalog (testnet scale — see lib/pagination.ts header)
  // so we can sort by the chosen metric BEFORE slicing the page. Passing
  // a generous limit upstream effectively asks for "everything" without
  // changing useFighters' contract.
  const { data: full, isLoading, error, refetch } = useFighters({ limit: 9999 });

  const sorted = useMemo<Fighter[]>(() => {
    const copy = [...full];
    copy.sort((a, b) => {
      if (metric === "earnings") return b.earnings - a.earnings;
      if (metric === "volume") return b.battles - a.battles;
      return b.elo - a.elo;
    });
    return copy;
  }, [full, metric]);

  const { slice, total, hasMore } = paginate(
    sorted,
    { limit, offset },
    TABLE_PAGE_SIZE,
  );

  return {
    data: slice,
    total,
    hasMore,
    isLoading,
    error,
    refetch,
  } as const;
}
