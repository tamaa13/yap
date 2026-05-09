"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtTime } from "@/lib/format";
import type { Battle } from "@/lib/types";

export function BattleHistoryTable({
  battles,
  fighterId,
}: {
  battles: Battle[];
  fighterId: number;
}) {
  const router = useRouter();
  return (
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr
            style={{
              background: "var(--bg-sunken)",
              borderBottom: "1px solid var(--bd-default)",
            }}
          >
            {["Date", "Opponent", "Topic", "Result"].map((h) => (
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
          {battles.map((b) => {
            const oppId = b.a === fighterId ? b.b : b.a;
            const won = b.winner === (b.a === fighterId ? "a" : "b");
            return (
              <tr
                key={b.id}
                onClick={() => router.push(`/arenas/${b.id}/result`)}
                style={{
                  borderBottom: "1px solid var(--bd-subtle)",
                  cursor: "pointer",
                }}
              >
                <td
                  style={{ padding: "12px 14px", color: "var(--tx-tertiary)" }}
                  className="mono"
                >
                  {b.endedAt ? fmtTime(b.endedAt) : "—"}
                </td>
                <td style={{ padding: "12px 14px" }}>Fighter #{oppId}</td>
                <td
                  style={{
                    padding: "12px 14px",
                    color: "var(--tx-secondary)",
                    maxWidth: 300,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.topic}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <Badge tone={won ? "success" : "danger"}>
                    {won ? "Won" : "Lost"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
