// In-memory token-bucket rate limiter. Keyed on arbitrary identifier (IP,
// wallet address, battleId, etc). Refills the full bucket once per window.
//
// Caveats:
//  - Per-process state. Deployments must be single-container (Railway/Fly)
//    or migrate buckets to Redis. Will undercount on serverless platforms
//    that fan out across instances.
//  - No persistence across restarts. Acceptable for hackathon scope.
//
// Usage:
//   const ok = consume("/start", `ip:${ip}`, { tokens: 10, windowMs: 60_000 });
//   if (!ok) return new Response("rate limited", { status: 429 });

import "server-only";

interface Bucket {
  tokens: number;
  refillAt: number;
}

const BUCKETS = new Map<string, Bucket>();

interface Limit {
  tokens: number;
  windowMs: number;
}

export function consume(scope: string, identifier: string, limit: Limit): boolean {
  const key = `${scope}:${identifier}`;
  const now = Date.now();
  const bucket = BUCKETS.get(key);
  if (!bucket || bucket.refillAt <= now) {
    BUCKETS.set(key, {
      tokens: limit.tokens - 1,
      refillAt: now + limit.windowMs,
    });
    return true;
  }
  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/** Reads the caller IP from request headers, falling back to "unknown". */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
