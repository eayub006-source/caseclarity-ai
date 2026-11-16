import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { badRequest, isUuid, oneOf, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const AUDIT_CATEGORIES = ["case", "document", "ai", "review", "integration", "system", "general"] as const;

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp));
  return NextResponse.json({ audit: rows });
}

// Append-only: there is no update or delete route. The actor is always the
// signed-in user — a client cannot write entries in someone else's name.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);
  const action = str(body.action, 200);
  if (!action) return badRequest("action is required");
  const [row] = await db
    .insert(auditLogs)
    .values({
      caseId: isUuid(body.caseId) ? body.caseId : null,
      actor: user.name,
      action,
      details: str(body.details, 2000),
      category: oneOf(body.category, AUDIT_CATEGORIES) || "general",
    })
    .returning();
  return NextResponse.json({ entry: row }, { status: 201 });
}
