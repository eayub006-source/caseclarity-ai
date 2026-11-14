import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(recommendations).orderBy(recommendations.createdAt);
  return NextResponse.json({ recommendations: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(recommendations)
    .values({
      caseId: body.caseId,
      title: body.title,
      summary: body.summary,
      reasoning: body.reasoning,
      confidence: body.confidence || 70,
      status: body.status || "pending",
      evidence: body.evidence || [],
      missingInfo: body.missingInfo || [],
      uncertainties: body.uncertainties || [],
      nextSteps: body.nextSteps || [],
      reviewedBy: body.reviewedBy || null,
      reviewComment: body.reviewComment || null,
    })
    .returning();
  return NextResponse.json({ recommendation: row }, { status: 201 });
}
