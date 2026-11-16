import { db } from "@/db";
import { cases, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized, forbidden, isManager } from "@/lib/auth-server";
import { CASE_STATUSES, PRIORITIES } from "@/lib/core";
import { badRequest, int, isUuid, notFound, oneOf, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await readJson(req);

  const patch: Partial<typeof cases.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) { const v = str(body.title, 200); if (!v) return badRequest("Title cannot be empty"); patch.title = v; }
  if (body.clientName !== undefined) { const v = str(body.clientName, 120); if (!v) return badRequest("Client name cannot be empty"); patch.clientName = v; }
  if (body.caseType !== undefined) patch.caseType = str(body.caseType, 80) || "Other";
  if (body.status !== undefined) { const v = oneOf(body.status, CASE_STATUSES); if (!v) return badRequest("Invalid status"); patch.status = v; }
  if (body.priority !== undefined) { const v = oneOf(body.priority, PRIORITIES); if (!v) return badRequest("Invalid priority"); patch.priority = v; }
  if (body.description !== undefined) patch.description = str(body.description, 4000);
  if (body.assignedTo !== undefined) patch.assignedTo = str(body.assignedTo, 120);
  if (body.completeness !== undefined) { const v = int(body.completeness, 0, 100); if (v === undefined) return badRequest("Invalid completeness"); patch.completeness = v; }

  const [row] = await db.update(cases).set(patch).where(eq(cases.id, id)).returning();
  if (!row) return notFound();
  return NextResponse.json({ case: row });
}

// Deleting a case removes its documents, facts and recommendations (cascade);
// its audit history is kept (case_id set to null) plus a deletion record.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!isManager(user)) return forbidden("Only senior case workers and admins can delete cases");
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const [row] = await db.delete(cases).where(eq(cases.id, id)).returning();
  if (!row) return notFound();
  await db.insert(auditLogs).values({ caseId: null, actor: user.name, action: "Case deleted", details: `${row.caseNumber} (${row.clientName}) deleted`, category: "case" });
  return NextResponse.json({ ok: true });
}
