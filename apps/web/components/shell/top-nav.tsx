"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { YapLogo } from "@/components/brand/yap-logo";
import { openConnectPanel, useWallet } from "@/hooks/use-wallet";
import { useBalance } from "@/hooks/use-balance";
import {
  useNotifications,
  type Notification,
} from "@/hooks/use-notifications";
import { fmtAddr, fmtNum } from "@/lib/format";

interface NavEntry {
  label: string;
  to: string;
  match: (path: string) => boolean;
}

const NAV: NavEntry[] = [
  {
    label: "Arenas",
    to: "/arenas",
    match: (p) => p === "/arenas" || p.startsWith("/arenas/") || p.startsWith("/battle/"),
  },
  { label: "Marketplace", to: "/market", match: (p) => p.startsWith("/market") },
  { label: "Leaderboard", to: "/leaderboard", match: (p) => p.startsWith("/leaderboard") },
  { label: "Vault", to: "/vault", match: (p) => p.startsWith("/vault") },
];

const DRAWER_NAV: Array<{ label: string; to: string; icon: IconName }> = [
  { label: "Arenas", to: "/arenas", icon: "zap" },
  { label: "Marketplace", to: "/market", icon: "grid" },
  { label: "Leaderboard", to: "/leaderboard", icon: "trophy" },
  { label: "Vault", to: "/vault", icon: "vault" },
  { label: "Wallet", to: "/wallet", icon: "wallet" },
];

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px",
        height: 32,
        fontSize: 13,
        fontWeight: 500,
        color: active ? "var(--tx-primary)" : "var(--tx-secondary)",
        borderRadius: 4,
        background: active ? "rgba(255,255,255,0.04)" : "transparent",
      }}
    >
      {entry.label}
    </Link>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { connected, addr, logout } = useWallet();
  const balance = useBalance();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<HTMLDivElement | null>(null);
  const { notifications, unreadCount, markAllRead, clear } = useNotifications();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const dropdownItem = {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--tx-primary)",
    borderRadius: 3,
  };

  return (
    <>
      <header
        className="al-topnav"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 52,
          background: "rgba(10,11,15,0.88)",
          backdropFilter: "saturate(1) blur(0px)",
          borderBottom: "1px solid var(--bd-default)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 20,
        }}
      >
        <button
          className="al-topnav-hamburger"
          onClick={() => setDrawerOpen(true)}
          style={{
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            color: "var(--tx-secondary)",
          }}
        >
          <Icon name="menu" size={18} />
        </button>

        <YapLogo />

        <nav
          className="al-topnav-primary"
          style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}
        >
          {NAV.map((entry) => (
            <NavLink key={entry.to} entry={entry} active={entry.match(pathname ?? "")} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {!connected ? (
          <Button
            variant="primary"
            size="sm"
            leading={<Icon name="wallet" size={13} />}
            onClick={() => openConnectPanel()}
          >
            Connect
          </Button>
        ) : (
          <>
            <Link
              href="/wallet"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--bd-default)",
                borderRadius: 4,
                fontFamily: "var(--mono)",
                fontSize: 12,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span className="al-topnav-balance-label" style={{ color: "var(--tx-tertiary)" }}>
                BAL
              </span>
              <span style={{ color: "var(--tx-primary)" }}>
                {balance == null ? "—" : fmtNum(balance, 2)}
              </span>
              <span style={{ color: "var(--tx-tertiary)" }}>0G</span>
            </Link>

            <div ref={notifRef} className="al-hide-below-md" style={{ position: "relative" }}>
              <button
                onClick={() => {
                  setNotifOpen((o) => {
                    const next = !o;
                    // Mark read on open so the unread dot clears immediately
                    // and persists across reload.
                    if (next && unreadCount > 0) markAllRead();
                    return next;
                  });
                }}
                style={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  color: "var(--tx-secondary)",
                  position: "relative",
                }}
                aria-label={
                  unreadCount > 0
                    ? `Notifications (${unreadCount} unread)`
                    : "Notifications"
                }
              >
                <Icon name="bell" size={16} />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 7,
                      right: 7,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      boxShadow: "0 0 0 2px rgba(10,11,15,0.88)",
                    }}
                  />
                )}
              </button>
              {notifOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 40,
                    right: 0,
                    width: 360,
                    maxHeight: 480,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--bd-default)",
                    borderRadius: 6,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--bd-subtle)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Notifications</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => clear()}
                        style={{
                          fontSize: 11,
                          color: "var(--tx-tertiary)",
                          fontWeight: 400,
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div
                      style={{
                        padding: "24px 14px",
                        fontSize: 12,
                        color: "var(--tx-tertiary)",
                        textAlign: "center",
                      }}
                    >
                      No notifications yet.
                    </div>
                  ) : (
                    <div style={{ overflowY: "auto", maxHeight: 420 }}>
                      {notifications.map((n) => (
                        <NotifItem
                          key={n.id}
                          n={n}
                          onClick={() => {
                            if (n.href) router.push(n.href);
                            setNotifOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div ref={userRef} className="al-hide-below-md" style={{ position: "relative" }}>
              <button
                onClick={() => setUserOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 32,
                  padding: "0 8px 0 4px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Sigil seed={addr ?? "anon"} size={24} color="#B8B0A2" />
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    color: "var(--tx-secondary)",
                  }}
                >
                  {fmtAddr(addr)}
                </span>
                <Icon name="chevronDown" size={12} style={{ color: "var(--tx-tertiary)" }} />
              </button>
              {userOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 40,
                    right: 0,
                    width: 220,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--bd-default)",
                    borderRadius: 6,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                    padding: 4,
                  }}
                >
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      if (addr) router.push(`/profile/${addr}`);
                    }}
                    style={dropdownItem}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/settings");
                    }}
                    style={dropdownItem}
                  >
                    Settings
                  </button>
                  <div style={{ height: 1, background: "var(--bd-subtle)", margin: "4px 0" }} />
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      logout();
                    }}
                    style={{ ...dropdownItem, color: "var(--danger)" }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {drawerOpen && (
        <>
          <div className="al-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="al-drawer">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 4px 12px",
                marginBottom: 8,
                borderBottom: "1px solid var(--bd-subtle)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--tx-tertiary)",
                  letterSpacing: 0.1,
                  textTransform: "uppercase",
                }}
              >
                Menu
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ color: "var(--tx-secondary)", padding: 4 }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            {DRAWER_NAV.map((n) => (
              <button
                key={n.to}
                className="al-drawer-item"
                onClick={() => {
                  setDrawerOpen(false);
                  router.push(n.to);
                }}
              >
                <Icon name={n.icon} size={14} />
                {n.label}
              </button>
            ))}
            <div style={{ height: 1, background: "var(--bd-subtle)", margin: "8px 0" }} />
            {connected && addr && (
              <button
                className="al-drawer-item"
                onClick={() => {
                  setDrawerOpen(false);
                  router.push(`/profile/${addr}`);
                }}
              >
                Profile
              </button>
            )}
            <button
              className="al-drawer-item"
              onClick={() => {
                setDrawerOpen(false);
                router.push("/settings");
              }}
            >
              Settings
            </button>
            <div style={{ flex: 1 }} />
            {connected ? (
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--tx-tertiary)",
                  padding: "8px 12px",
                }}
              >
                {fmtAddr(addr)} · {balance == null ? "—" : fmtNum(balance, 2)} 0G
              </div>
            ) : (
              <div style={{ padding: "8px 12px" }}>
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  leading={<Icon name="wallet" size={13} />}
                  onClick={() => {
                    setDrawerOpen(false);
                    openConnectPanel();
                  }}
                >
                  Connect wallet
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

const NOTIF_ICON: Record<Notification["kind"], IconName> = {
  challenge_accepted: "sword",
  challenge_declined: "x",
  challenge_cancelled: "alert",
  verdict_submitted: "zap",
  battle_settled: "check",
  payout_claimed: "wallet",
};

function NotifItem({
  n,
  onClick,
}: {
  n: Notification;
  onClick: () => void;
}) {
  const ago = formatRelative(n.ts);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        gap: 10,
        padding: "10px 14px",
        borderBottom: "1px solid var(--bd-subtle)",
        background: n.read ? "transparent" : "rgba(255,255,255,0.02)",
      }}
    >
      <Icon
        name={NOTIF_ICON[n.kind] ?? "bell"}
        size={14}
        style={{ color: "var(--tx-secondary)", marginTop: 2, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--tx-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {n.message}
        </div>
        {n.detail && (
          <div
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {n.detail}
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: "var(--tx-tertiary)",
            marginTop: 4,
          }}
        >
          {ago}
        </div>
      </div>
    </button>
  );
}

function formatRelative(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
