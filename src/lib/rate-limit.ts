// Small fixed-window rate limiter (in memory, per server instance).
// Good enough to stop password guessing against a single instance; a
// multi-instance deployment should move this to a shared store (e.g. Redis).

interface Bucket { count: number; resetAt: number; }

const buckets = new Map<string, Bucket>();

export interface RateResult { allowed: boolean; retryAfterSec: number; }

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    sweep(now);
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}

export function reset(key: string) {
  buckets.delete(key);
}

// Drop expired buckets occasionally so memory stays bounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}
