import { cookies } from "next/headers";
import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword } from "./password";

// Server-side session authentication.
// - Session tokens are random 256-bit values; only their SHA-256 hash is stored.
// - The raw token travels in an httpOnly cookie (never readable from JS).
// - Passwords are bcrypt-hashed (see ./password.ts).

export const SESSION_COOKIE = "cc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  org: string;
}

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role || "Case Worker", org: "Northside Legal Aid" };
}

export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!rows.length) return null;
  const found = await db.select().from(users).where(eq(users.id, rows[0].userId as string));
  if (!found.length) return null;
  return toSessionUser(found[0]);
}

// Returns the authenticated user or null. API routes use this to enforce
// authentication; unauthenticated requests receive 401.
export async function requireUser(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}

export const DEMO_EMAIL = "demo@caseclarity.ai";
export const DEMO_PASSWORD = "demo1234";

// Bootstrap: creates the demo judge account (with a hashed password) if it
// does not exist yet. Called by the auth route and the seed route.
export async function ensureDemoUser() {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing.length) return existing[0];
  const [row] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: "Alex Rivera", password: await hashPassword(DEMO_PASSWORD), role: "Senior Case Worker" })
    .returning();
  return row;
}
