import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, getSessionUser, ensureDemoUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Server-side authentication:
// - Passwords are bcrypt-hashed at rest (never plaintext).
// - Successful login/signup creates a server-side session; the raw token is
//   returned only in an httpOnly cookie. Only its SHA-256 hash is stored.

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password, name, action } = body;

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const em = String(email).trim().toLowerCase();

  if (action === "signup") {
    const existing = await db.select().from(users).where(eq(users.email, em));
    if (existing.length) return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    const [row] = await db
      .insert(users)
      .values({ email: em, name: name || "Case Worker", password: await hashPassword(String(password)) })
      .returning();
    await createSession(row.id);
    return NextResponse.json(
      { user: { id: row.id, name: row.name, email: row.email, role: "Case Worker", org: "Northside Legal Aid" } },
      { status: 201 }
    );
  }

  // Login (default). Bootstrap the demo account on first use.
  await ensureDemoUser();
  const found = await db.select().from(users).where(eq(users.email, em));
  if (!found.length || !(await verifyPassword(String(password), found[0].password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await createSession(found[0].id);
  return NextResponse.json({
    user: { id: found[0].id, name: found[0].name, email: found[0].email, role: found[0].role || "Case Worker", org: "Northside Legal Aid" },
  });
}
