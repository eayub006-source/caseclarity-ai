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

// Checks whether `key` is over its limit WITHOUT counting an attempt.
export function peek(key: string, limit: number, now = Date.now()): RateResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now || b.count < limit) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

export function reset(key: string) {
  buckets.delete(key);
}

// Drop expired buckets occasionally so memory stays bounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

// Client IP for rate limiting, or null when it cannot be trusted.
// X-Forwarded-For / X-Real-IP are set by the client unless a reverse proxy
// overwrites them, so they are only used when TRUST_PROXY=true (e.g. on
// Vercel or behind nginx configured to set them). Callers must never rely on
// the IP alone: per-account limits apply regardless.
export function clientIp(req: Request, trustProxy = process.env.TRUST_PROXY === "true"): string | null {
  if (!trustProxy) return null;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    // The right-most entry is the one appended by our own proxy.
    if (hops.length) return hops[hops.length - 1];
  }
  return null;
}
