import { cookies } from "next/headers";
import crypto from "crypto";
import { eq, and, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword } from "./password";
import { normalizeRole, canManage, ROLE_LABELS, Role } from "./roles";
import { DEFAULT_ORG } from "./server-config";

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
  role: Role;
  roleLabel: string;
  org: string;
}

export function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  const role = normalizeRole(row.role);
  return { id: row.id, name: row.name, email: row.email, role, roleLabel: ROLE_LABELS[role], org: row.org || DEFAULT_ORG };
}

export async function createSession(userId: string): Promise<void> {
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => {});
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
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!rows.length) return null;
  return toSessionUser(rows[0].user);
}

// Returns the authenticated user, or null when there is no valid session.
// Database errors are NOT swallowed: they surface as 500s instead of being
// mistaken for "logged out" (401).
export async function requireUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const forbidden = (msg = "Your role does not allow this action") => NextResponse.json({ error: msg }, { status: 403 });

export function isManager(user: SessionUser): boolean {
  return canManage(user.role);
}

export const DEMO_EMAIL = "demo@caseclarity.ai";
export const DEMO_PASSWORD = "demo1234";

// Bootstrap: creates the demo account (with a hashed password) if it does not
// exist yet. Callers must check isDemoEnabled() first.
export async function ensureDemoUser() {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing.length) return existing[0];
  const [row] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: "Alex Rivera", password: await hashPassword(DEMO_PASSWORD), role: "senior_case_worker", org: DEFAULT_ORG })
    .returning();
  return row;
}
