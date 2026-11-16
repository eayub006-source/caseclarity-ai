import { db } from "@/db";
import { cases, documents, extractions, recommendations, auditLogs } from "@/db/schema";
import { NextResponse } from "next/server";
import { seedCases, seedDocs, seedExtractions, seedRecommendations, seedAudit } from "@/lib/core";
import { requireUser, unauthorized, forbidden, isManager } from "@/lib/auth-server";
import { isDemoEnabled } from "@/lib/server-config";

export const dynamic = "force-dynamic";

// Seeds the fictional demo dataset into PostgreSQL.
// POST /api/seed          -> seed only if the cases table is empty (signed-in users)
// POST /api/seed?reset=1  -> wipe case data and re-seed (senior case workers / admins)
// Both are disabled when demo mode is off (see isDemoEnabled()).

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
      documentId: e.documentId ? docMap.get(e.documentId) ?? null : null,
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
      engine: "seed",
      evidence: r.evidence,
      contradictions: r.contradictions || [],
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
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!isDemoEnabled()) return NextResponse.json({ seeded: false, reason: "Demo data is disabled on this deployment" }, { status: 403 });

  const reset = new URL(req.url).searchParams.get("reset") === "1";
  if (reset) {
    if (!isManager(user)) return forbidden("Only senior case workers and admins can reset demo data");
    await db.transaction(async (tx) => {
      await tx.delete(auditLogs);
      await tx.delete(recommendations);
      await tx.delete(extractions);
      await tx.delete(documents);
      await tx.delete(cases);
    });
    await seedAll();
    await db.insert(auditLogs).values({ caseId: null, actor: user.name, action: "Demo data reset", details: "Workspace reset to fictional seed data", category: "system" });
    return NextResponse.json({ seeded: true });
  }

  const existing = await db.select({ id: cases.id }).from(cases).limit(1);
  if (existing.length > 0) return NextResponse.json({ seeded: false, reason: "Database already seeded" });
  await seedAll();
  return NextResponse.json({ seeded: true });
}
