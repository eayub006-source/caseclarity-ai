import { db } from "@/db";
import { cases } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { insertCaseWithNumber } from "@/lib/cases-server";
import { dedupeCases } from "@/lib/csv";
import { CASE_STATUSES, PRIORITIES } from "@/lib/core";
import { badRequest, oneOf, readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const MAX_IMPORT = 500;

// Validates one incoming case. Returns an error message or the clean values.
function cleanCase(raw: Record<string, unknown>, defaults: { assignedTo: string }) {
  const title = str(raw.title, 200);
  const clientName = str(raw.clientName, 120);
  const caseType = str(raw.caseType, 80) || "Other";
  if (!title) return { error: "Title is required" };
  if (!clientName) return { error: "Client name is required" };
  const created = typeof raw.createdAt === "string" ? new Date(raw.createdAt) : null;
  return {
    values: {
      title, clientName, caseType,
      status: oneOf(raw.status, CASE_STATUSES) || "awaiting_review",
      priority: oneOf(raw.priority, PRIORITIES) || "medium",
      description: str(raw.description, 4000),
      assignedTo: str(raw.assignedTo, 120) || defaults.assignedTo,
      completeness: 0,
      ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created } : {}),
    },
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
  return NextResponse.json({ cases: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);

  // Bulk CSV import: server-side validation + dedupe by client + title.
  if (Array.isArray(body.items)) {
    if (body.items.length > MAX_IMPORT) return badRequest(`Import at most ${MAX_IMPORT} cases at a time`);
    const valid: NonNullable<ReturnType<typeof cleanCase>["values"]>[] = [];
    let invalid = 0;
    for (const it of body.items) {
      const c = it && typeof it === "object" ? cleanCase(it as Record<string, unknown>, { assignedTo: "Imported" }) : { error: "bad row" };
      if (c.values) valid.push(c.values); else invalid++;
    }
    const existing = await db.select({ clientName: cases.clientName, title: cases.title }).from(cases);
    const { fresh, skipped } = dedupeCases(valid, existing);
    const inserted = [];
    for (const v of fresh) inserted.push(await insertCaseWithNumber(v));
    return NextResponse.json({ added: inserted.length, skipped, invalid, cases: inserted });
  }

  const c = cleanCase(body, { assignedTo: user.name });
  if (!c.values) return badRequest(c.error!);
  const row = await insertCaseWithNumber(c.values);
  return NextResponse.json({ case: row }, { status: 201 });
}
