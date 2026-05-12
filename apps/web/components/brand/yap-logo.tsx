"use client";

import Link from "next/link";
import { YapMark } from "./yap-mark";

export interface YapLogoProps {
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function YapLogo({ size = "md", href = "/" }: YapLogoProps) {
  const h = size === "lg" ? 32 : size === "sm" ? 20 : 24;
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        color: "#FFFFFF",
        textDecoration: "none",
      }}
    >
      <YapMark size={h} />
    </Link>
  );
}
