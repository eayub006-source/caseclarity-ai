import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createSession, destroySession, getSessionUser, ensureDemoUser, toSessionUser, DEMO_EMAIL } from "@/lib/auth-server";
import { isDemoEnabled, DEFAULT_ORG } from "@/lib/server-config";
import { hit, reset, clientIp } from "@/lib/rate-limit";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Server-side authentication:
// - Passwords are bcrypt-hashed at rest (never plaintext).
// - Successful login/signup creates a server-side session; the raw token is
//   returned only in an httpOnly cookie. Only its SHA-256 hash is stored.
// - Login and signup are rate-limited per IP (and per IP + email for login).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_LIMIT = 10, LOGIN_WINDOW = 15 * 60 * 1000;
const IP_LIMIT = 50;
const SIGNUP_LIMIT = 10, SIGNUP_WINDOW = 60 * 60 * 1000;

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
    const rl = hit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW);
    if (!rl.allowed) return tooMany(rl.retryAfterSec);
    if (!EMAIL_RE.test(em)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
    }
    if (password.length > 200) return NextResponse.json({ error: "Password is too long" }, { status: 400 });
    if (em === DEMO_EMAIL) return NextResponse.json({ error: "Account already exists" }, { status: 409 });
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
    await createSession(row.id);
    return NextResponse.json({ user: toSessionUser(row) }, { status: 201 });
  }

  // Login (default).
  const ipRl = hit(`login-ip:${ip}`, IP_LIMIT, LOGIN_WINDOW);
  const rl = hit(`login:${ip}:${em}`, LOGIN_LIMIT, LOGIN_WINDOW);
  if (!ipRl.allowed) return tooMany(ipRl.retryAfterSec);
  if (!rl.allowed) return tooMany(rl.retryAfterSec);

  // Bootstrap the demo account on first use — only when demo mode is enabled.
  if (em === DEMO_EMAIL) {
    if (!isDemoEnabled()) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    await ensureDemoUser();
  }
  const found = await db.select().from(users).where(eq(users.email, em));
  if (!found.length || !(await verifyPassword(password, found[0].password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  reset(`login:${ip}:${em}`);
  await createSession(found[0].id);
  return NextResponse.json({ user: toSessionUser(found[0]) });
}
