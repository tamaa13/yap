"use client";

import Link from "next/link";
import { YapMark } from "./yap-mark";

export interface YapLogoProps {
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function YapLogo({ size = "md", href = "/" }: YapLogoProps) {
  const h = size === "lg" ? 32 : size === "sm" ? 20 : 22;
  const fs = size === "lg" ? 20 : size === "sm" ? 13 : 15;
  return (
    <Link
      href={href}
      style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
    >
      <YapMark size={h} />
      <span
        className="al-topnav-logo-text"
        style={{
          fontSize: fs,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          fontFamily: "var(--sans)",
          color: "var(--tx-primary)",
        }}
      >
        yap
      </span>
    </Link>
  );
}
