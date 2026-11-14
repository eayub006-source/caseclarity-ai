import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(auditLogs).orderBy(auditLogs.timestamp);
  return NextResponse.json({ audit: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(auditLogs)
    .values({
      caseId: body.caseId || null,
      actor: body.actor || user.name,
      action: body.action,
      details: body.details || "",
      category: body.category || "general",
    })
    .returning();
  return NextResponse.json({ entry: row }, { status: 201 });
}
