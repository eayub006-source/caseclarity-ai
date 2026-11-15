import { db } from "@/db";
import { extractions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const caseId = new URL(req.url).searchParams.get("caseId");
  const rows = caseId
    ? await db.select().from(extractions).where(eq(extractions.caseId, caseId))
    : await db.select().from(extractions);
  return NextResponse.json({ extractions: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ extractions: [] });
  const rows = await db
    .insert(extractions)
    .values(
      items.map((e: Record<string, unknown>) => ({
        caseId: e.caseId as string,
        documentId: (e.documentId as string) || null,
        fieldName: e.fieldName as string,
        fieldValue: e.fieldValue as string,
        confidence: (e.confidence as number) || 80,
        sourceDoc: (e.sourceDoc as string) || "",
        sourcePage: (e.sourcePage as number) || 1,
        sourceSnippet: (e.sourceSnippet as string) || "",
        category: (e.category as string) || "fact",
      }))
    )
    .returning();
  return NextResponse.json({ extractions: rows }, { status: 201 });
}

// Deletes all extractions for a case (used when re-running analysis so facts
// are replaced rather than duplicated).
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  await db.delete(extractions).where(eq(extractions.caseId, caseId));
  return NextResponse.json({ ok: true });
}
