"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Icon } from "@/components/ui/icon";

export interface Crumb {
  label: string;
  to?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--tx-tertiary)",
        marginBottom: 16,
      }}
    >
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const color = isLast ? "var(--tx-primary)" : "var(--tx-tertiary)";
        return (
          <Fragment key={`${it.label}-${i}`}>
            {i > 0 && <Icon name="chevronRight" size={12} />}
            {it.to ? (
              <Link href={it.to} style={{ color }}>
                {it.label}
              </Link>
            ) : (
              <span style={{ color }}>{it.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
