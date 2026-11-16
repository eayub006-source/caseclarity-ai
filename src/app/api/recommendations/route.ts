import { db } from "@/db";
import { cases, recommendations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { badRequest, int, isUuid, notFound, oneOf, readJson, str, strList } from "@/lib/validate";

export const dynamic = "force-dynamic";

function cleanEvidence(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const o = e as Record<string, unknown>;
    const claim = str(o.claim, 500);
    if (!claim) return [];
    return [{ claim, doc: str(o.doc, 255), page: int(o.page, 1, 100000) ?? 1, snippet: str(o.snippet, 600), verified: o.verified !== false }];
  });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await db.select().from(recommendations).orderBy(desc(recommendations.createdAt));
  return NextResponse.json({ recommendations: rows });
}

// New recommendations are always created as "pending": only a human review
// (PATCH /api/recommendations/[id]) can approve, modify or reject them.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);
  if (!isUuid(body.caseId)) return badRequest("A valid caseId is required");
  const title = str(body.title, 200), summary = str(body.summary, 2000), reasoning = str(body.reasoning, 6000);
  if (!title || !summary) return badRequest("Title and summary are required");
  const [parent] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, body.caseId));
  if (!parent) return notFound("Case not found");
  const [row] = await db
    .insert(recommendations)
    .values({
      caseId: body.caseId,
      title, summary,
      reasoning: reasoning || summary,
      confidence: int(body.confidence, 0, 100) ?? 70,
      status: "pending",
      engine: oneOf(body.engine, ["demo", "llm"] as const) || "demo",
      evidence: cleanEvidence(body.evidence),
      contradictions: strList(body.contradictions),
      missingInfo: strList(body.missingInfo),
      uncertainties: strList(body.uncertainties),
      nextSteps: strList(body.nextSteps),
    })
    .returning();
  return NextResponse.json({ recommendation: row }, { status: 201 });
}
