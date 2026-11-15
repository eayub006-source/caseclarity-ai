import Papa from "papaparse";
import { CaseItem, uid } from "./core";

// Standards-compliant CSV parsing (RFC 4180) via PapaParse:
// handles quoted fields, embedded commas/newlines, CRLF, etc.
// Replaces the previous naive split(",") parser.

export interface CsvRow {
  [key: string]: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: CsvRow[];
  errors: string[];
}

export function parseCasesCSV(text: string): ParsedCSV {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return {
    headers: parsed.meta.fields || [],
    rows: parsed.data,
    errors: parsed.errors.map((e) => e.message),
  };
}

export interface BuiltCases {
  items: CaseItem[];
  warnings: string[];
  dateFormats: string[];
}

export function buildCasesFromRows(rows: CsvRow[]): BuiltCases {
  const warnings: string[] = [];
  const dateFormats = new Set<string>();

  const items: CaseItem[] = rows.map((row, idx) => {
    const client = (row.client_name || row.client || row.name || "").trim();
    const title = (row.title || row.case_title || row.case || "").trim();
    if (!client) warnings.push(`Row ${idx + 2}: missing client name — defaulted.`);
    if (!title) warnings.push(`Row ${idx + 2}: missing title — defaulted.`);
    const dateRaw = (row.date || row.created || row.created_at || "").trim();
    if (dateRaw) {
      dateFormats.add(/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? "YYYY-MM-DD" : /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw) ? "MM/DD/YYYY" : "other");
    }
    return {
      id: uid(),
      caseNumber: "CC-2026-" + String(100 + idx + Math.floor(Math.random() * 800)),
      title: title || `Imported case for ${client || "client"}`,
      clientName: client || `Imported Client ${idx + 1}`,
      caseType: (row.case_type || row.type || row.category || "Other").trim() || "Other",
      status: "awaiting_review" as const,
      priority: "medium" as const,
      description: `Imported via CSV on ${new Date().toLocaleDateString("en-US")}.`,
      assignedTo: "Imported",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completeness: 0,
    };
  });

  return { items, warnings, dateFormats: [...dateFormats] };
}

// Deduplicates by client + title (case-insensitive). Returns the fresh items
// and the number of duplicates skipped. Used by both the API bulk import and
// the unit tests so behavior is identical everywhere.
export function dedupeCases(items: CaseItem[], existing: CaseItem[]): { fresh: CaseItem[]; skipped: number } {
  const keys = new Set(existing.map((c) => (c.clientName + "|" + c.title).toLowerCase()));
  const fresh: CaseItem[] = [];
  let skipped = 0;
  for (const it of items) {
    const k = (it.clientName + "|" + it.title).toLowerCase();
    if (keys.has(k)) skipped++;
    else {
      keys.add(k);
      fresh.push(it);
    }
  }
  return { fresh, skipped };
}
