import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { badRequest, isUuid, notFound, oneOf, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Human review of a recommendation. Only the review fields can change:
// the AI's evidence, confidence and reasoning are immutable. The reviewer is
// always the signed-in user (never taken from the request body), and a
// recommendation that was approved or rejected is locked.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await readJson(req);

  const status = oneOf(body.status, ["approved", "rejected", "modified"] as const);
  if (!status) return badRequest("status must be approved, rejected or modified");
  const reviewComment = str(body.reviewComment, 2000);
  const summary = str(body.summary, 2000);
  if (status === "modified" && !summary) return badRequest("A modified recommendation needs the new text");

  const [current] = await db.select({ status: recommendations.status }).from(recommendations).where(eq(recommendations.id, id));
  if (!current) return notFound();
  if (current.status === "approved" || current.status === "rejected") {
    return NextResponse.json({ error: `This recommendation was already ${current.status} and is locked.` }, { status: 409 });
  }

  const [row] = await db
    .update(recommendations)
    .set({
      status,
      reviewComment: reviewComment || null,
      reviewedBy: user.name,
      reviewedAt: new Date(),
      ...(status === "modified" ? { summary } : {}),
    })
    .where(eq(recommendations.id, id))
    .returning();
  return NextResponse.json({ recommendation: row });
}
