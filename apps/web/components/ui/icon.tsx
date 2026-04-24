import type { CSSProperties, ReactNode } from "react";

type IconName =
  | "home" | "sword" | "shop" | "trophy" | "vault" | "wallet" | "bell" | "user"
  | "chevronDown" | "chevronRight" | "chevronLeft" | "plus" | "check" | "x"
  | "search" | "filter" | "upload" | "download" | "copy" | "external" | "shield"
  | "zap" | "dot" | "clock" | "users" | "send" | "eye" | "edit" | "tag"
  | "list" | "grid" | "menu" | "arrowRight" | "arrowLeft" | "trend" | "share"
  | "more" | "alert" | "settings" | "lock" | "logout" | "refresh";

const paths: Record<IconName, ReactNode> = {
  home:       <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  sword:      <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></>,
  shop:       <><path d="M3 7h18l-2 13H5L3 7Z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></>,
  trophy:     <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v3a3 3 0 0 1-3 3" /><path d="M7 5H4v3a3 3 0 0 0 3 3" /></>,
  vault:      <><rect x="3" y="5" width="18" height="14" rx="1" /><circle cx="15" cy="12" r="2.5" /><path d="M15 9.5v-1" /><path d="M15 15.5v-1" /><path d="M12.5 12h-1" /></>,
  wallet:     <><path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3V7Z" /><path d="M3 7V5a2 2 0 0 1 2-2h11" /><circle cx="16.5" cy="13" r="1" /></>,
  bell:       <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user:       <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  chevronDown:<path d="m6 9 6 6 6-6" />,
  chevronRight:<path d="m9 6 6 6-6 6" />,
  chevronLeft:<path d="m15 6-6 6 6 6" />,
  plus:       <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  check:      <path d="m5 12 5 5L20 7" />,
  x:          <><path d="M6 6l12 12" /><path d="m18 6-12 12" /></>,
  search:     <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  filter:     <path d="M3 5h18l-7 9v5l-4 2v-7L3 5Z" />,
  upload:     <><path d="M12 3v14" /><path d="m6 9 6-6 6 6" /><path d="M3 21h18" /></>,
  download:   <><path d="M12 3v14" /><path d="m6 11 6 6 6-6" /><path d="M3 21h18" /></>,
  copy:       <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></>,
  external:   <><path d="M9 5H5v14h14v-4" /><path d="M15 3h6v6" /><path d="m10 14 11-11" /></>,
  shield:     <><path d="M12 3 4 6v6c0 5 3 8 8 9 5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  zap:        <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />,
  dot:        <circle cx="12" cy="12" r="4" />,
  clock:      <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users:      <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8" /><path d="M21 21a6 6 0 0 0-4-5.7" /></>,
  send:       <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>,
  eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  edit:       <><path d="M4 20h4L20 8l-4-4L4 16v4Z" /><path d="m14 6 4 4" /></>,
  tag:        <><path d="M3 3h9l9 9-9 9-9-9V3Z" /><circle cx="8" cy="8" r="1.5" /></>,
  list:       <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  grid:       <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  menu:       <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m13 5 7 7-7 7" /></>,
  arrowLeft:  <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  trend:      <><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  share:      <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m9 11 6-4" /><path d="m9 13 6 4" /></>,
  more:       <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  alert:      <><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></>,
  settings:   <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  lock:       <><rect x="4" y="10" width="16" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  logout:     <><path d="M15 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  refresh:    <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
};

export interface IconProps {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, style, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export type { IconName };
