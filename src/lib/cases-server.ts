import { db } from "@/db";
import { cases } from "@/db/schema";
import { isUniqueViolation } from "./validate";

type NewCase = Omit<typeof cases.$inferInsert, "caseNumber">;

async function highestCaseNumber(): Promise<number> {
  const rows = await db.select({ n: cases.caseNumber }).from(cases);
  let max = 0;
  for (const r of rows) {
    const m = (r.n || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function formatCaseNumber(n: number, year = new Date().getFullYear()): string {
  return `CC-${year}-${String(n).padStart(3, "0")}`;
}

// Inserts a case with the next free case number. Two requests can compute the
// same number at the same time; the unique constraint rejects one of them and
// we simply retry with a fresh number.
export async function insertCaseWithNumber(values: NewCase) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const n = (await highestCaseNumber()) + 1 + attempt;
    try {
      const [row] = await db.insert(cases).values({ ...values, caseNumber: formatCaseNumber(n) }).returning();
      return row;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("Could not allocate a case number — please retry.");
}
