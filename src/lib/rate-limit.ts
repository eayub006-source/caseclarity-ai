// Small fixed-window rate limiter (in memory, per server instance).
// Good enough to stop password guessing against a single instance; a
// multi-instance deployment should move this to a shared store (e.g. Redis).

interface Bucket { count: number; resetAt: number; }

const buckets = new Map<string, Bucket>();

export interface RateResult { allowed: boolean; retryAfterSec: number; }

// Counts one attempt and returns the bucket it was counted in.
function take(key: string, limit: number, windowMs: number, now: number): RateResult & { bucket: Bucket } {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 1, resetAt: now + windowMs };
    buckets.set(key, b);
    sweep(now);
    return { allowed: true, retryAfterSec: 0, bucket: b };
  }
  b.count += 1;
  if (b.count > limit) return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), bucket: b };
  return { allowed: true, retryAfterSec: 0, bucket: b };
}

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const { allowed, retryAfterSec } = take(key, limit, windowMs, now);
  return { allowed, retryAfterSec };
}

// Gives back one attempt — only to the exact bucket (window) it was counted
// in. If that window has expired or been replaced, there is nothing to undo,
// so a refund can never reduce the count of a newer window.
function giveBack(key: string, bucket: Bucket, now: number) {
  if (buckets.get(key) === bucket && bucket.resetAt > now && bucket.count > 0) bucket.count -= 1;
}

// Atomically reserves one attempt on every key (synchronously, before any
// await, so concurrent requests cannot all pass a check-then-count gap).
// Returns a function that refunds the reservation, e.g. when a login
// succeeds. If any key is over its limit, nothing stays reserved.
export function reserve(
  keys: [key: string, limit: number][],
  windowMs: number,
  now = Date.now(),
): { allowed: true; refund: (at?: number) => void } | { allowed: false; retryAfterSec: number } {
  const taken: [string, Bucket][] = [];
  for (const [key, limit] of keys) {
    const r = take(key, limit, windowMs, now);
    taken.push([key, r.bucket]);
    if (!r.allowed) {
      for (const [k, b] of taken) giveBack(k, b, now);
      return { allowed: false, retryAfterSec: r.retryAfterSec };
    }
  }
  let refunded = false;
  return {
    allowed: true,
    refund: (at = Date.now()) => {
      if (refunded) return;
      refunded = true;
      for (const [k, b] of taken) giveBack(k, b, at);
    },
  };
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

// The header carrying the real client IP, or null when no proxy is trusted.
// Client-supplied headers are only meaningful when OUR proxy overwrites them,
// and which header that is depends on the host — so it is configured, never
// guessed, and there is no fallback to a different header:
//   TRUST_PROXY=true + TRUSTED_IP_HEADER=x-vercel-forwarded-for  (Vercel)
//   TRUST_PROXY=true + TRUSTED_IP_HEADER=cf-connecting-ip        (Cloudflare)
//   TRUST_PROXY=true + TRUSTED_IP_HEADER=x-real-ip               (nginx: proxy_set_header X-Real-IP $remote_addr)
//   TRUST_PROXY=true (default header x-forwarded-for)            (nginx: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for)
export function trustedIpHeader(env: Record<string, string | undefined> = process.env): string | null {
  if (env.TRUST_PROXY !== "true") return null;
  return (env.TRUSTED_IP_HEADER || "x-forwarded-for").trim().toLowerCase();
}

// Client IP for rate limiting, or null when it cannot be trusted.
export function clientIp(req: Request, header: string | null = trustedIpHeader()): string | null {
  if (!header) return null;
  const value = req.headers.get(header);
  if (!value) return null;
  const parts = value.split(",").map((h) => h.trim()).filter(Boolean);
  if (!parts.length) return null;
  // X-Forwarded-For is a list: our proxy appends the address it saw on the
  // right, so client-prefilled entries (on the left) are ignored. Headers set
  // whole by the proxy (X-Real-IP, CF-Connecting-IP, …) hold a single value.
  return header === "x-forwarded-for" ? parts[parts.length - 1] : parts[0];
}
