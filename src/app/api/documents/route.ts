import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const caseId = new URL(req.url).searchParams.get("caseId");
  const rows = caseId
    ? await db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(documents.uploadedAt)
    : await db.select().from(documents).orderBy(documents.uploadedAt);
  return NextResponse.json({ documents: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(documents)
    .values({
      caseId: body.caseId,
      name: body.name,
      type: body.type,
      size: body.size || 0,
      status: body.status || "processed",
      extractedText: body.extractedText || "",
      source: body.source || "Upload",
      pageCount: body.pageCount || 1,
    })
    .returning();
  return NextResponse.json({ document: row }, { status: 201 });
}
