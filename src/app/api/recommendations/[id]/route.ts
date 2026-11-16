import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { and, eq, isNull, notInArray, or } from "drizzle-orm";
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

  // The lock check is part of the UPDATE itself, so two simultaneous reviews
  // cannot both succeed: the second one matches no row.
  const [row] = await db
    .update(recommendations)
    .set({
      status,
      reviewComment: reviewComment || null,
      reviewedBy: user.name,
      reviewedAt: new Date(),
      ...(status === "modified" ? { summary } : {}),
    })
    .where(and(eq(recommendations.id, id), or(isNull(recommendations.status), notInArray(recommendations.status, ["approved", "rejected"]))))
    .returning();
  if (row) return NextResponse.json({ recommendation: row });

  // Nothing updated: either it does not exist or it is already locked.
  const [current] = await db.select({ status: recommendations.status }).from(recommendations).where(eq(recommendations.id, id));
  if (!current) return notFound();
  return NextResponse.json({ error: `This recommendation was already ${current.status} and is locked.` }, { status: 409 });
}
