"use client";

// Memory access log surface for a fighter INFT. Lists every
// PersonaAccessed event emitted by YapFighter — one row per encrypted-
// persona decryption, captured at the moment the runner pulls the seed
// to launch a round of inference. This is the auditability claim made
// concrete: there's no inference that isn't on-chain.
//
// Pre-redeploy bytecode emits no events. We render the same empty state
// as a never-fought fighter, intentionally — the contract migration is
// invisible to spectators. Once redeploy + first inference, rows land.

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Hash } from "@/components/ui/hash";
import { Skel } from "@/components/ui/skeleton";
import {
  Pagination,
  usePageFromUrl,
} from "@/components/ui/pagination";
import { useFighterAccessLog } from "@/hooks/use-fighter-access-log";
import { pageToOffset } from "@/lib/pagination";
import { fmtTime } from "@/lib/format";
import { activeChain } from "@/lib/chains";

const PAGE_SIZE = 20;

export function AccessLogTable({ fighterId }: { fighterId: number }) {
  const router = useRouter();
  const { data, isLoading } = useFighterAccessLog(fighterId);

  // Reuse the page-from-url helper. Page key is access-log-scoped so
  // it doesn't collide with battle-history pagination on the same page.
  const page = usePageFromUrl("page-access");
  const offset = pageToOffset(page, PAGE_SIZE);
  const visible = data.slice(offset, offset + PAGE_SIZE);

  if (isLoading) {
    return (
      <Card style={{ padding: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 16,
              padding: "12px 0",
              borderBottom: "1px solid var(--bd-subtle)",
            }}
          >
            <Skel w={120} h={12} />
            <Skel w={80} h={12} />
            <Skel w={180} h={12} />
          </div>
        ))}
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon="shield"
        title="No inference activity yet"
        body="Every time this fighter's encrypted persona is decrypted for a round, the contract emits a PersonaAccessed event. Send it into battle and the timeline writes itself."
      />
    );
  }

  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--mono)",
          color: "var(--yap-ink-300)",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        On-chain inference log · {data.length} access
        {data.length === 1 ? "" : "es"}
      </div>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-sunken)",
                borderBottom: "1px solid var(--bd-default)",
              }}
            >
              {["Timestamp", "Battle", "Accessor", "Tx"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    fontWeight: 500,
                    letterSpacing: 0.08,
                    textTransform: "uppercase",
                    color: "var(--tx-tertiary)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr
                key={`${entry.txHash}-${entry.logIndex}`}
                onClick={() =>
                  router.push(
                    `/arenas/b-${entry.battleId.toString(16).padStart(4, "0")}`,
                  )
                }
                style={{
                  borderTop: "1px solid var(--bd-subtle)",
                  cursor: "pointer",
                }}
              >
                <td
                  style={{ padding: "12px 14px", color: "var(--tx-tertiary)" }}
                  className="mono"
                >
                  {fmtTime(entry.timestamp)}
                </td>
                <td
                  style={{ padding: "12px 14px", color: "var(--yap-gold)" }}
                  className="mono"
                >
                  #{entry.battleId}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <Hash value={entry.accessor} />
                </td>
                <td
                  style={{ padding: "12px 14px" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`${activeChain.blockExplorers.default.url}/tx/${entry.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--tx-tertiary)",
                      letterSpacing: 0.04,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {entry.txHash.slice(0, 10)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination
        total={data.length}
        limit={PAGE_SIZE}
        paramKey="page-access"
        noun="accesses"
      />
    </>
  );
}

