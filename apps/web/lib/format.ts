export function fmtAddr(a?: string | null): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtNum(n: number | null | undefined, d = 0): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function fmt0G(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return `${fmtNum(n, d)} 0G`;
}

export function fmtTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtRemaining(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "expired";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm ? `in ${h}h ${rm}m` : `in ${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `in ${d}d ${rh}h` : `in ${d}d`;
}
