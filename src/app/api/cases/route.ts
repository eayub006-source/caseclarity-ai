import { db } from "@/db";
import { cases } from "@/db/schema";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { dedupeCases } from "@/lib/csv";

export const dynamic = "force-dynamic";

async function baseCaseNumber(): Promise<number> {
  const rows = await db.select({ n: cases.caseNumber }).from(cases);
  const nums = rows.map((r) => parseInt((r.n || "").split("-").pop() || "0", 10)).filter((n) => !isNaN(n));
  return nums.length ? Math.max(...nums) : 6;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(cases).orderBy(cases.createdAt);
  return NextResponse.json({ cases: rows });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // Bulk CSV import: server-side dedupe by client + title.
  if (Array.isArray(body.items)) {
    const existing = await db.select().from(cases);
    const { fresh, skipped } = dedupeCases(body.items, existing as never);
    let n = await baseCaseNumber();
    const inserted = [];
    for (const it of fresh) {
      n += 1;
      const [row] = await db
        .insert(cases)
        .values({
          caseNumber: "CC-2026-" + String(n).padStart(3, "0"),
          title: it.title,
          clientName: it.clientName,
          caseType: it.caseType,
          status: it.status || "awaiting_review",
          priority: it.priority || "medium",
          description: it.description || "",
          assignedTo: it.assignedTo || "Imported",
        })
        .returning();
      inserted.push(row);
    }
    return NextResponse.json({ added: inserted.length, skipped, cases: inserted });
  }

  const n = (await baseCaseNumber()) + 1;
  const [row] = await db
    .insert(cases)
    .values({
      caseNumber: "CC-2026-" + String(n).padStart(3, "0"),
      title: body.title,
      clientName: body.clientName,
      caseType: body.caseType,
      status: body.status || "awaiting_review",
      priority: body.priority || "medium",
      description: body.description || "",
      assignedTo: body.assignedTo || "",
    })
    .returning();
  return NextResponse.json({ case: row }, { status: 201 });
}
