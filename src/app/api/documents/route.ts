import { db } from "@/db";
import { cases, documents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { badRequest, int, isUuid, notFound, oneOf, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const DOC_STATUSES = ["uploaded", "processing", "processed", "failed"] as const;

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (caseId && !isUuid(caseId)) return NextResponse.json({ documents: [] });
  const rows = caseId
    ? await db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.uploadedAt))
    : await db.select().from(documents).orderBy(desc(documents.uploadedAt));
  return NextResponse.json({ documents: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);
  if (!isUuid(body.caseId)) return badRequest("A valid caseId is required");
  const name = str(body.name, 255);
  if (!name) return badRequest("Document name is required");
  const [parent] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, body.caseId));
  if (!parent) return notFound("Case not found");
  const [row] = await db
    .insert(documents)
    .values({
      caseId: body.caseId,
      name,
      type: str(body.type, 20) || "FILE",
      size: int(body.size, 0, 2_000_000_000) ?? 0,
      status: oneOf(body.status, DOC_STATUSES) || "processed",
      extractedText: typeof body.extractedText === "string" ? body.extractedText.slice(0, 2_000_000) : "",
      source: str(body.source, 80) || "Upload",
      pageCount: int(body.pageCount, 1, 100000) ?? 1,
    })
    .returning();
  return NextResponse.json({ document: row }, { status: 201 });
}
