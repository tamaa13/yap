"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWatchContractEvent } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";

/**
 * Lifecycle notifications for the connected user, derived from BattleEscrow
 * events.
 *
 * Approach:
 *   - Watch BattleCreated / BetPlaced where the address arg === user → keep
 *     a local "battleIds I care about" set, persisted to localStorage.
 *   - Watch BattleAccepted / BattleDeclined / VerdictSubmitted /
 *     BattleSettled / BattleCancelled / PayoutClaimed → emit a notification
 *     when the battleId matches the cared-about set.
 *   - Notifications + cared-about set are persisted under a per-address key
 *     so switching wallets doesn't leak history across accounts.
 *
 * The hook returns a small API the top-nav dropdown consumes: list of
 * notifications, unread count, and a markAllRead() / clear() pair.
 */

export type NotifKind =
  | "challenge_accepted"
  | "challenge_declined"
  | "challenge_cancelled"
  | "verdict_submitted"
  | "battle_settled"
  | "payout_claimed";

export interface Notification {
  /** Stable id = `${kind}:${battleId}:${txHash}` so repeated events on
   *  reconnect don't dupe entries. */
  id: string;
  kind: NotifKind;
  battleId: number;
  message: string;
  /** Optional secondary line — winner side, payout amount, etc. */
  detail?: string;
  /** Path the dropdown link routes to when clicked. */
  href?: string;
  ts: number;
  read: boolean;
}

const STORAGE_VERSION = 1;
const MAX_STORED = 30;

interface PersistedState {
  v: number;
  caredBattleIds: number[];
  notifications: Notification[];
}

function storageKey(addr: string): string {
  return `yap.notifications.${addr.toLowerCase()}`;
}

function loadFromStorage(addr: string): PersistedState {
  const empty: PersistedState = {
    v: STORAGE_VERSION,
    caredBattleIds: [],
    notifications: [],
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(storageKey(addr));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.v !== STORAGE_VERSION) return empty;
    return {
      v: STORAGE_VERSION,
      caredBattleIds: Array.isArray(parsed.caredBattleIds)
        ? parsed.caredBattleIds.filter((n) => typeof n === "number")
        : [],
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.filter((n): n is Notification =>
            Boolean(n && typeof n.id === "string" && typeof n.battleId === "number"),
          )
        : [],
    };
  } catch {
    return empty;
  }
}

function saveToStorage(addr: string, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    // Cap stored notifications so a long-lived session doesn't blow past
    // localStorage quotas.
    const trimmed: PersistedState = {
      ...state,
      notifications: state.notifications.slice(0, MAX_STORED),
    };
    window.localStorage.setItem(storageKey(addr), JSON.stringify(trimmed));
  } catch {
    // localStorage may be full / disabled — silent fail, in-memory state still works.
  }
}

export function useNotifications() {
  const { address } = useAccount();
  const enabled = Boolean(address && BATTLE_ESCROW_ADDRESS !== "");

  const [state, setState] = useState<PersistedState>(() => ({
    v: STORAGE_VERSION,
    caredBattleIds: [],
    notifications: [],
  }));

  // Hydrate from localStorage on address change.
  useEffect(() => {
    if (!address) {
      setState({ v: STORAGE_VERSION, caredBattleIds: [], notifications: [] });
      return;
    }
    setState(loadFromStorage(address));
  }, [address]);

  // Persist on every change.
  useEffect(() => {
    if (!address) return;
    saveToStorage(address, state);
  }, [address, state]);

  const upsert = useCallback(
    (notif: Notification) => {
      setState((prev) => {
        if (prev.notifications.some((n) => n.id === notif.id)) return prev;
        return {
          ...prev,
          notifications: [notif, ...prev.notifications],
        };
      });
    },
    [],
  );

  const trackBattle = useCallback((battleId: number) => {
    setState((prev) => {
      if (prev.caredBattleIds.includes(battleId)) return prev;
      return {
        ...prev,
        caredBattleIds: [...prev.caredBattleIds, battleId],
      };
    });
  }, []);

  const isTrackedRef = useTrackedRef(state.caredBattleIds);

  // ─── Cared-about recording ──────────────────────────────────────────
  // BattleCreated: if I'm the creator, track this battleId.
  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleCreated",
    onLogs: (logs) => {
      if (!enabled || !address) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const creator = String(args?.creator ?? "");
        const battleId = Number(args?.battleId ?? 0);
        if (!battleId) continue;
        if (creator.toLowerCase() === address.toLowerCase()) {
          trackBattle(battleId);
        }
      }
    },
    enabled,
  });

  // BetPlaced: if I'm the bettor, track this battleId (covers spectators
  // who bet but didn't create).
  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BetPlaced",
    onLogs: (logs) => {
      if (!enabled || !address) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const bettor = String(args?.bettor ?? "");
        const battleId = Number(args?.battleId ?? 0);
        if (!battleId) continue;
        if (bettor.toLowerCase() === address.toLowerCase()) {
          trackBattle(battleId);
        }
      }
    },
    enabled,
  });

  // ─── Notification-emitting events ───────────────────────────────────
  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleAccepted",
    onLogs: (logs) => {
      if (!enabled) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId || !isTrackedRef.current(battleId)) continue;
        upsert({
          id: `challenge_accepted:${battleId}:${txHash}`,
          kind: "challenge_accepted",
          battleId,
          message: `Battle #${battleId} accepted`,
          detail: "Defender matched your stake — runner can start now",
          href: `/arenas/b-${String(battleId).padStart(4, "0")}`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleDeclined",
    onLogs: (logs) => {
      if (!enabled) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId || !isTrackedRef.current(battleId)) continue;
        upsert({
          id: `challenge_declined:${battleId}:${txHash}`,
          kind: "challenge_declined",
          battleId,
          message: `Battle #${battleId} declined`,
          detail: "Defender refused — your stake will be refunded on cancel",
          href: `/arenas/b-${String(battleId).padStart(4, "0")}`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleCancelled",
    onLogs: (logs) => {
      if (!enabled) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId || !isTrackedRef.current(battleId)) continue;
        upsert({
          id: `challenge_cancelled:${battleId}:${txHash}`,
          kind: "challenge_cancelled",
          battleId,
          message: `Battle #${battleId} cancelled`,
          detail: "Stakes refundable via claimPayout",
          href: `/arenas/b-${String(battleId).padStart(4, "0")}`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "VerdictSubmitted",
    onLogs: (logs) => {
      if (!enabled) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const winner = Number(args?.winner ?? 0);
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId || !isTrackedRef.current(battleId)) continue;
        const sideLabel = winner === 0 ? "A" : winner === 1 ? "B" : "Draw";
        upsert({
          id: `verdict_submitted:${battleId}:${txHash}`,
          kind: "verdict_submitted",
          battleId,
          message: `Verdict in for battle #${battleId}`,
          detail: `Winner: ${sideLabel} — dispute window now active`,
          href: `/arenas/b-${String(battleId).padStart(4, "0")}/result`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleSettled",
    onLogs: (logs) => {
      if (!enabled) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const winner = Number(args?.winner ?? 0);
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId || !isTrackedRef.current(battleId)) continue;
        const sideLabel = winner === 0 ? "A" : winner === 1 ? "B" : "Draw";
        upsert({
          id: `battle_settled:${battleId}:${txHash}`,
          kind: "battle_settled",
          battleId,
          message: `Battle #${battleId} settled (${sideLabel})`,
          detail: "Eligible bettors can claim payout",
          href: `/arenas/b-${String(battleId).padStart(4, "0")}/result`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  useWatchContractEvent({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    eventName: "PayoutClaimed",
    onLogs: (logs) => {
      if (!enabled || !address) return;
      for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        const battleId = Number(args?.battleId ?? 0);
        const bettor = String(args?.bettor ?? "");
        const amount = args?.amount as bigint | undefined;
        const txHash = (log as unknown as { transactionHash: string })
          .transactionHash;
        if (!battleId) continue;
        if (bettor.toLowerCase() !== address.toLowerCase()) continue;
        const ogAmount =
          amount != null ? (Number(amount) / 1e18).toFixed(4) : "?";
        upsert({
          id: `payout_claimed:${battleId}:${txHash}`,
          kind: "payout_claimed",
          battleId,
          message: `Payout claimed (${ogAmount} 0G)`,
          detail: `From battle #${battleId}`,
          href: `/arenas/b-${String(battleId).padStart(4, "0")}/result`,
          ts: Date.now(),
          read: false,
        });
      }
    },
    enabled,
  });

  // ─── Public API ─────────────────────────────────────────────────────
  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.read).length,
    [state.notifications],
  );

  const markAllRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.read ? n : { ...n, read: true },
      ),
    }));
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, notifications: [] }));
  }, []);

  return {
    notifications: state.notifications,
    unreadCount,
    markAllRead,
    clear,
    /** Allow callers (e.g. mint flow) to register interest in a battle they
     *  just created off-chain so we don't miss the BattleCreated → indexed
     *  event race. */
    trackBattle,
  };
}

/**
 * Stable ref to the latest tracked-set predicate. Inline closures inside
 * useWatchContractEvent's onLogs would otherwise see stale state on every
 * fire.
 */
function useTrackedRef(caredBattleIds: number[]) {
  const ref = useRef<(id: number) => boolean>(() => false);
  ref.current = (id: number) => caredBattleIds.includes(id);
  return ref;
}
