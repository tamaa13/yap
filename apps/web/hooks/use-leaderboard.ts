"use client";

import { useMemo } from "react";
import { useFighters } from "./use-fighters";
import type { Fighter } from "@/lib/types";

type Metric = "elo" | "earnings" | "volume";

export function useLeaderboard(metric: Metric = "elo") {
  const { data, isLoading, error, refetch } = useFighters({});

  const sorted = useMemo<Fighter[]>(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      if (metric === "earnings") return b.earnings - a.earnings;
      if (metric === "volume") return b.battles - a.battles;
      return b.elo - a.elo;
    });
    return copy;
  }, [data, metric]);

  return { data: sorted, isLoading, error, refetch } as const;
}
