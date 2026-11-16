import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createSession, destroySession, getSessionUser, ensureDemoUser, toSessionUser, DEMO_EMAIL } from "@/lib/auth-server";
import { isDemoEnabled, DEFAULT_ORG } from "@/lib/server-config";
import { reserve, reset, clientIp } from "@/lib/rate-limit";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Server-side authentication:
// - Passwords are bcrypt-hashed at rest (never plaintext).
// - Successful login/signup creates a server-side session; the raw token is
//   returned only in an httpOnly cookie. Only its SHA-256 hash is stored.
// - Attempts are reserved atomically BEFORE any await (no check-then-count
//   race). A successful login refunds its reservation, so only FAILED logins
//   count; a signup that does not create an account is refunded too.
// - Per-account cap (always on, independent of IP): stops password guessing
//   even from many addresses. It is deliberately a few times the per-source
//   cap: high enough that one attacker cannot lock out the real user, low
//   enough that guessing stays impractical.
// - With a trusted client IP (TRUST_PROXY=true, recommended in production):
//   a tighter per email + IP cap blocks the attacker's own source first, and a
//   per-IP cap stops one address from spraying many accounts.
// Trade-off: an attacker with FAILS_PER_ACCOUNT failures (from several
// trusted IPs, or from anywhere when TRUST_PROXY is off) can lock an account
// for up to 15 minutes. Use a CAPTCHA if that becomes a real problem.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_WINDOW = 15 * 60 * 1000;
const FAILS_PER_SOURCE = 10;      // per email + trusted IP
const FAILS_PER_ACCOUNT = 30;     // per email, all sources — always enforced
const FAILS_PER_IP = 50;          // per trusted IP, all accounts
const SIGNUP_WINDOW = 60 * 60 * 1000;
const SIGNUPS_PER_IP = 10;        // successful signups per trusted IP
const SIGNUPS_GLOBAL = 200;       // successful signups per window when no IP is known

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const action = str(body.action, 20);

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  const em = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!em || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  const ip = clientIp(req);

  if (action === "signup") {
    // Validate first: invalid requests never touch the shared allowance.
    if (!EMAIL_RE.test(em)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
    }
    if (password.length > 200) return NextResponse.json({ error: "Password is too long" }, { status: 400 });
    if (em === DEMO_EMAIL) return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    // Reserve before any await; refunded unless an account is created.
    const slot = reserve([[ip ? `signup:${ip}` : "signup:global", ip ? SIGNUPS_PER_IP : SIGNUPS_GLOBAL]], SIGNUP_WINDOW);
    if (!slot.allowed) return tooMany(slot.retryAfterSec);
    let row: typeof users.$inferSelect;
    try {
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, em));
      if (existing.length) { slot.refund(); return NextResponse.json({ error: "Account already exists" }, { status: 409 }); }
      [row] = await db
        .insert(users)
        .values({
          email: em,
          name: str(body.name, 120) || "Case Worker",
          org: str(body.org, 160) || DEFAULT_ORG,
          role: "case_worker",
          password: await hashPassword(password),
        })
        .returning();
    } catch (e) {
      slot.refund();
      throw e;
    }
    await createSession(row.id);
    return NextResponse.json({ user: toSessionUser(row) }, { status: 201 });
  }

  // Login (default). Reserve the attempt on every limit before any await.
  const limits: [string, number][] = [[`login-acct:${em}`, FAILS_PER_ACCOUNT]];
  if (ip) limits.push([`login:${em}:${ip}`, FAILS_PER_SOURCE], [`login-ip:${ip}`, FAILS_PER_IP]);
  const slot = reserve(limits, LOGIN_WINDOW);
  if (!slot.allowed) return tooMany(slot.retryAfterSec);
  const invalid = () => NextResponse.json({ error: "Invalid credentials" }, { status: 401 }); // reservation kept = failure counted

  let found: (typeof users.$inferSelect)[];
  try {
    // Bootstrap the demo account on first use — only when demo mode is enabled.
    if (em === DEMO_EMAIL) {
      if (!isDemoEnabled()) return invalid();
      await ensureDemoUser();
    }
    found = await db.select().from(users).where(eq(users.email, em));
  } catch (e) {
    slot.refund(); // a server error is not a failed guess
    throw e;
  }
  if (!found.length || !(await verifyPassword(password, found[0].password))) return invalid();
  slot.refund(); // successful logins are not counted
  if (ip) reset(`login:${em}:${ip}`);
  await createSession(found[0].id);
  return NextResponse.json({ user: toSessionUser(found[0]) });
}
