"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "./button";
import { Icon } from "./icon";
import {
  offsetToPage,
  pageToOffset,
  totalPages as computeTotalPages,
} from "@/lib/pagination";

export interface PaginationProps {
  /** Total items across all pages. When `total <= limit`, the component
   *  returns null (no chrome for one-page lists). */
  total: number;
  /** Page size — must match the size used to compute the data slice. */
  limit: number;
  /** Singular noun for the "X of Y fighters" indicator. Use lowercase. */
  noun?: string;
  /** URL query param key for the page number. Defaults to `page`.
   *  Pass a per-tab key (e.g. `page` scoped under `?tab=owned`) and
   *  the parent decides the tab routing. */
  paramKey?: string;
  /** When set, this query param's value gates whether the pagination
   *  chrome is the active scope. Used by tab-prefixed URLs (vault) so
   *  switching tabs resets to page 1 of the new tab. */
  scopeKey?: string;
  scopeValue?: string;
}

/** URL-driven pagination control. Reads `?page=N` (1-indexed),
 *  rewrites via `router.replace` so the back button respects history.
 *  Hidden when `total <= limit` (one page). */
export function Pagination({
  total,
  limit,
  noun = "items",
  paramKey = "page",
}: PaginationProps) {
  const router = useRouter();
  const params = useSearchParams();
  const pages = computeTotalPages(total, limit);
  const currentPage = Math.min(
    pages,
    Math.max(1, Number(params.get(paramKey) || "1")),
  );

  const goto = useCallback(
    (next: number) => {
      const target = Math.min(pages, Math.max(1, next));
      const sp = new URLSearchParams(params.toString());
      if (target === 1) sp.delete(paramKey);
      else sp.set(paramKey, String(target));
      const qs = sp.toString();
      // Use replace (not push) so paginating doesn't bury the
      // pre-pagination state under N back-button presses.
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [pages, paramKey, params, router],
  );

  if (total <= limit) return null;

  const startIdx = (currentPage - 1) * limit + 1;
  const endIdx = Math.min(total, currentPage * limit);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        flexWrap: "wrap",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          color: "var(--yap-ink-300)",
          textTransform: "uppercase",
        }}
      >
        Page{" "}
        <span style={{ color: "var(--yap-ink-50)" }}>
          {String(currentPage).padStart(2, "0")}
        </span>{" "}
        / {String(pages).padStart(2, "0")}
        <span style={{ marginLeft: 12, color: "var(--yap-ink-400)" }}>
          {startIdx}–{endIdx} of {total} {noun}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          size="sm"
          variant="ghost"
          leading={<Icon name="chevronLeft" size={12} />}
          onClick={() => goto(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="ghost"
          trailing={<Icon name="chevronRight" size={12} />}
          onClick={() => goto(currentPage + 1)}
          disabled={currentPage >= pages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** Read the current page number from URL (1-indexed). Use alongside
 *  `pageToOffset` to derive the offset hooks need. */
export function usePageFromUrl(paramKey = "page"): number {
  const params = useSearchParams();
  const raw = Number(params.get(paramKey) || "1");
  return Math.max(1, Math.floor(raw) || 1);
}

/** Animated row-list wrapper. Stagger 0.04s on entry, but only when
 *  the parent's `pageKey` (the current page number) actually changed
 *  — initial mount stays still per MOTION.md "no default fade-in"
 *  rule. Use this around table tbody rows or grid items. */
export function PaginatedRows({
  pageKey,
  children,
}: {
  pageKey: number | string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children],
  );
  if (reduced) return <>{children}</>;
  return (
    <>
      {childrenArray.map((child, i) => (
        <motion.div
          key={`${pageKey}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.22,
            delay: i * 0.04,
            ease: [0.32, 0.72, 0, 1],
          }}
          style={{ display: "contents" }}
        >
          {child}
        </motion.div>
      ))}
    </>
  );
}

export { pageToOffset, offsetToPage, computeTotalPages };
