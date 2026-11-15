import { db } from "@/db";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const ALLOWED = ["title", "clientName", "caseType", "status", "priority", "description", "assignedTo", "completeness"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ALLOWED) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const [row] = await db.update(cases).set(patch).where(eq(cases.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ case: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(cases).where(eq(cases.id, id));
  return NextResponse.json({ ok: true });
}
