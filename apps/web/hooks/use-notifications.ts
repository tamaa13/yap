"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { Notification } from "@/lib/notifications/types";

export type { NotifKind } from "@/lib/notifications/types";

/** Hook-level notification: server-pushed Notification plus a per-id
 *  `read` flag tracked in memory. */
export interface NotificationWithRead extends Notification {
  read: boolean;
}

// Back-compat alias for callers that imported the previous in-memory
// shape under the name `Notification`.
export type { NotificationWithRead as Notification };

/**
 * Subscribes to /api/notifications/stream for the connected wallet.
 *
 * Server pushes both an initial historical replay (last ~day of blocks)
 * and every new lifecycle event in real time as the chain progresses. The
 * hook keeps an in-memory list deduped by notification id, plus a per-id
 * read flag so opening the dropdown can clear the unread badge without
 * dropping entries from the feed.
 *
 * No localStorage — the server stream is authoritative. Reconnect (e.g.
 * after a tab sleep) replays the same recent history because notification
 * ids are stable `kind:battleId:txHash`, so dedup keeps the list correct.
 */

interface State {
  /** Newest-first. */
  list: Notification[];
  /** Set of read notification ids — local-only, lost on reload (which
   *  is fine because the server replays everything). */
  read: Set<string>;
}

const initial: State = { list: [], read: new Set<string>() };

export function useNotifications() {
  const { address } = useAccount();
  const [state, setState] = useState<State>(initial);
  const sourceRef = useRef<EventSource | null>(null);

  // (Re)connect SSE whenever the address changes.
  useEffect(() => {
    // Tear down any existing source on transition / unmount.
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    // Reset state when wallet changes — we'll get a fresh replay for the
    // new address.
    setState(initial);
    if (!address) return;

    const url = `/api/notifications/stream?address=${address.toLowerCase()}`;
    const src = new EventSource(url);
    sourceRef.current = src;

    src.onmessage = (ev) => {
      try {
        const notif = JSON.parse(ev.data) as Notification;
        setState((prev) => {
          // Dedup by id (server replays on reconnect; this keeps single entry).
          if (prev.list.some((n) => n.id === notif.id)) return prev;
          // Insert in chronological order (newest at head).
          const list = [notif, ...prev.list].sort((a, b) => b.ts - a.ts);
          return { list, read: prev.read };
        });
      } catch {
        // Ignore malformed frames.
      }
    };

    src.onerror = () => {
      // EventSource auto-reconnects on transport errors. We only log here
      // because explicit disconnect handling happens in cleanup.
    };

    return () => {
      src.close();
      sourceRef.current = null;
    };
  }, [address]);

  const unreadCount = useMemo(
    () => state.list.filter((n) => !state.read.has(n.id)).length,
    [state],
  );

  const markAllRead = useCallback(() => {
    setState((prev) => {
      if (prev.list.every((n) => prev.read.has(n.id))) return prev;
      const read = new Set(prev.read);
      for (const n of prev.list) read.add(n.id);
      return { ...prev, read };
    });
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({ list: [], read: new Set<string>() }));
  }, []);

  // Kept on the API for back-compat with the TopNav integration; the
  // server-side scanner derives "cared battles" from on-chain logs, so
  // the client no longer needs to register interest itself.
  const trackBattle = useCallback((_battleId: number) => {}, []);

  // Wrap each notif with its current read flag for the dropdown.
  const notifications = useMemo(
    () =>
      state.list.map((n) => ({
        ...n,
        read: state.read.has(n.id),
      })),
    [state],
  );

  return {
    notifications,
    unreadCount,
    markAllRead,
    clear,
    trackBattle,
  };
}
