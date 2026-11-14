import { db } from "@/db";
import { cases, documents, extractions, recommendations, auditLogs } from "@/db/schema";
import { NextResponse } from "next/server";
import { seedCases, seedDocs, seedExtractions, seedRecommendations, seedAudit } from "@/lib/core";
import { requireUser, ensureDemoUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Seeds the fictional demo dataset into PostgreSQL (idempotent).
// POST /api/seed        -> seed only if the cases table is empty
// POST /api/seed?reset=1 -> wipe demo data and re-seed (requires auth)

async function seedAll() {
  const cs = seedCases();
  const insertedCases = await db
    .insert(cases)
    .values(
      cs.map((c) => ({
        caseNumber: c.caseNumber,
        title: c.title,
        clientName: c.clientName,
        caseType: c.caseType,
        status: c.status,
        priority: c.priority,
        description: c.description,
        assignedTo: c.assignedTo,
        completeness: c.completeness,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      }))
    )
    .returning();
  const caseMap = new Map(cs.map((c, i) => [c.id, insertedCases[i].id]));

  const ds = seedDocs();
  const insertedDocs = await db
    .insert(documents)
    .values(
      ds.map((d) => ({
        caseId: caseMap.get(d.caseId)!,
        name: d.name,
        type: d.type,
        size: d.size,
        status: d.status,
        extractedText: d.extractedText,
        pageCount: d.pageCount,
        uploadedAt: new Date(d.uploadedAt),
      }))
    )
    .returning();
  const docMap = new Map(ds.map((d, i) => [d.id, insertedDocs[i].id]));

  const es = seedExtractions();
  await db.insert(extractions).values(
    es.map((e) => ({
      caseId: caseMap.get(e.caseId)!,
      documentId: docMap.get(e.documentId)!,
      fieldName: e.fieldName,
      fieldValue: e.fieldValue,
      confidence: e.confidence,
      sourceDoc: e.sourceDoc,
      sourcePage: e.sourcePage,
      sourceSnippet: e.sourceSnippet,
      category: e.category,
    }))
  );

  const rs = seedRecommendations();
  await db.insert(recommendations).values(
    rs.map((r) => ({
      caseId: caseMap.get(r.caseId)!,
      title: r.title,
      summary: r.summary,
      reasoning: r.reasoning,
      confidence: r.confidence,
      status: r.status,
      evidence: r.evidence,
      missingInfo: r.missingInfo,
      uncertainties: r.uncertainties,
      nextSteps: r.nextSteps,
      reviewedBy: r.reviewedBy || null,
      reviewComment: r.reviewComment || null,
      createdAt: new Date(r.createdAt),
    }))
  );

  const as = seedAudit();
  await db.insert(auditLogs).values(
    as.map((a) => ({
      caseId: a.caseId ? caseMap.get(a.caseId)! : null,
      actor: a.actor,
      action: a.action,
      details: a.details,
      category: a.category,
      timestamp: new Date(a.timestamp),
    }))
  );

  await ensureDemoUser();
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const reset = url.searchParams.get("reset") === "1";
  const existing = await db.select({ id: cases.id }).from(cases);

  if (existing.length > 0 && !reset) {
    return NextResponse.json({ seeded: false, reason: "Database already seeded" });
  }
  if (reset) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await db.delete(auditLogs);
    await db.delete(recommendations);
    await db.delete(extractions);
    await db.delete(documents);
    await db.delete(cases);
  }
  await seedAll();
  return NextResponse.json({ seeded: true });
}
