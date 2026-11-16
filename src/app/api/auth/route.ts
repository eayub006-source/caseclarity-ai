import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createSession, destroySession, getSessionUser, ensureDemoUser, toSessionUser, DEMO_EMAIL } from "@/lib/auth-server";
import { isDemoEnabled, DEFAULT_ORG } from "@/lib/server-config";
import { hit, peek, reset, clientIp } from "@/lib/rate-limit";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Server-side authentication:
// - Passwords are bcrypt-hashed at rest (never plaintext).
// - Successful login/signup creates a server-side session; the raw token is
//   returned only in an httpOnly cookie. Only its SHA-256 hash is stored.
// - Only FAILED logins and SUCCESSFUL signups are counted, so nobody can use
//   up someone else's allowance with requests that would fail anyway.
// - With a trusted client IP (TRUST_PROXY=true, recommended in production):
//   failures are blocked per email + IP, so an attacker only locks out their
//   own source; a much higher per-account cap is a backstop against
//   distributed guessing.
// - Without a trusted IP, the per-account failure limit applies. Trade-off: a
//   third party can then lock an account for up to 15 minutes. Set
//   TRUST_PROXY=true behind Vercel/nginx to avoid this.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_WINDOW = 15 * 60 * 1000;
const FAILS_PER_SOURCE = 10;      // per email + trusted IP (or per email when no IP is known)
const FAILS_PER_ACCOUNT = 100;    // per email, all sources (backstop when IPs are trusted)
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
    const signupKey = ip ? `signup:${ip}` : "signup:global";
    const signupLimit = ip ? SIGNUPS_PER_IP : SIGNUPS_GLOBAL;
    const rl = peek(signupKey, signupLimit);
    if (!rl.allowed) return tooMany(rl.retryAfterSec);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, em));
    if (existing.length) return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    const [row] = await db
      .insert(users)
      .values({
        email: em,
        name: str(body.name, 120) || "Case Worker",
        org: str(body.org, 160) || DEFAULT_ORG,
        role: "case_worker",
        password: await hashPassword(password),
      })
      .returning();
    hit(signupKey, signupLimit, SIGNUP_WINDOW); // count successful signups only
    await createSession(row.id);
    return NextResponse.json({ user: toSessionUser(row) }, { status: 201 });
  }

  // Login (default). Check the limits without counting; count only failures.
  const sourceKey = ip ? `login:${em}:${ip}` : `login:${em}`;
  const limits: [string, number][] = [[sourceKey, FAILS_PER_SOURCE]];
  if (ip) limits.push([`login-acct:${em}`, FAILS_PER_ACCOUNT], [`login-ip:${ip}`, FAILS_PER_IP]);
  for (const [key, limit] of limits) {
    const rl = peek(key, limit);
    if (!rl.allowed) return tooMany(rl.retryAfterSec);
  }
  const fail = () => {
    for (const [key, limit] of limits) hit(key, limit, LOGIN_WINDOW);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  };

  // Bootstrap the demo account on first use — only when demo mode is enabled.
  if (em === DEMO_EMAIL) {
    if (!isDemoEnabled()) return fail();
    await ensureDemoUser();
  }
  const found = await db.select().from(users).where(eq(users.email, em));
  if (!found.length || !(await verifyPassword(password, found[0].password))) return fail();
  reset(sourceKey);
  await createSession(found[0].id);
  return NextResponse.json({ user: toSessionUser(found[0]) });
}
