import { db } from "@/db";
import { extractions } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { badRequest, int, isUuid, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (caseId && !isUuid(caseId)) return NextResponse.json({ extractions: [] });
  const rows = caseId
    ? await db.select().from(extractions).where(eq(extractions.caseId, caseId)).orderBy(asc(extractions.createdAt))
    : await db.select().from(extractions).orderBy(asc(extractions.createdAt));
  return NextResponse.json({ extractions: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return NextResponse.json({ extractions: [] });
  const values = [];
  for (const raw of items) {
    const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!isUuid(e.caseId)) return badRequest("Each fact needs a valid caseId");
    const fieldName = str(e.fieldName, 120), fieldValue = str(e.fieldValue, 500);
    if (!fieldName || !fieldValue) continue;
    values.push({
      caseId: e.caseId,
      // A fact whose source document is unknown is stored without a document link.
      documentId: isUuid(e.documentId) ? e.documentId : null,
      fieldName, fieldValue,
      confidence: int(e.confidence, 0, 100) ?? 80,
      sourceDoc: str(e.sourceDoc, 255),
      sourcePage: int(e.sourcePage, 1, 100000) ?? 1,
      sourceSnippet: str(e.sourceSnippet, 600),
      category: str(e.category, 30) || "fact",
      verified: e.verified !== false,
    });
  }
  if (!values.length) return NextResponse.json({ extractions: [] });
  const rows = await db.insert(extractions).values(values).returning();
  return NextResponse.json({ extractions: rows }, { status: 201 });
}

// Deletes all extractions for a case (used when re-running analysis so facts
// are replaced rather than duplicated).
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!isUuid(caseId)) return badRequest("caseId required");
  await db.delete(extractions).where(eq(extractions.caseId, caseId));
  return NextResponse.json({ ok: true });
}
