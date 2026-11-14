import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const ALLOWED = ["title", "summary", "reasoning", "confidence", "status", "evidence", "missingInfo", "uncertainties", "nextSteps", "reviewedBy", "reviewComment"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.status) patch.reviewedAt = new Date();
  const [row] = await db.update(recommendations).set(patch).where(eq(recommendations.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ recommendation: row });
}
