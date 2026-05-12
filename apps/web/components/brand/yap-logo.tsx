"use client";

import Link from "next/link";
import { YapMark } from "./yap-mark";

export interface YapLogoProps {
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function YapLogo({ size = "md", href = "/" }: YapLogoProps) {
  const h = size === "lg" ? 32 : size === "sm" ? 18 : 22;
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        textDecoration: "none",
      }}
    >
      <YapMark size={h} />
    </Link>
  );
}
