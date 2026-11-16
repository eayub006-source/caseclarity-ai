import Papa from "papaparse";
import { CaseItem, CaseStatus, CASE_STATUSES, CASE_TYPES, PRIORITIES, uid } from "./core";

// Standards-compliant CSV parsing and writing (RFC 4180) via PapaParse:
// handles quoted fields, embedded commas/newlines, CRLF, etc.

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
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  return {
    headers: parsed.meta.fields || [],
    rows: parsed.data,
    errors: parsed.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

// RFC 4180 output: every field that needs it is quoted and escaped.
export function toCSV(header: string[], rows: (string | number | null | undefined)[][]): string {
  return Papa.unparse({ fields: header, data: rows.map((r) => r.map((v) => (v ?? "") as string | number)) }, { quotes: false, newline: "\r\n" });
}

// Browser-only helper: triggers a download of the given CSV text.
export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "other";

// Returns an ISO timestamp, or null when the value cannot be understood.
export function normalizeDate(raw: string): { iso: string | null; format: DateFormat } {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { iso: safeIso(+m[1], +m[2], +m[3]), format: "YYYY-MM-DD" };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { iso: safeIso(y, +m[1], +m[2]), format: "MM/DD/YYYY" };
  }
  const t = Date.parse(s);
  return { iso: Number.isNaN(t) ? null : new Date(t).toISOString(), format: "other" };
}

function safeIso(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString() : null;
}

const STATUS_ALIASES: Record<string, CaseStatus> = {
  open: "awaiting_review", new: "awaiting_review", pending: "awaiting_review", "awaiting review": "awaiting_review",
  active: "in_progress", "in progress": "in_progress", closed: "completed", done: "completed", complete: "completed",
  "missing documents": "missing_docs", "missing docs": "missing_docs", flagged: "flagged",
};

export interface BuiltCases {
  items: CaseItem[];
  warnings: string[];
  dateFormats: string[];
}

export function buildCasesFromRows(rows: CsvRow[]): BuiltCases {
  const warnings: string[] = [];
  const dateFormats = new Set<string>();
  const now = new Date().toISOString();

  const items: CaseItem[] = rows.map((row, idx) => {
    const line = idx + 2;
    const client = (row.client_name || row.client || row.name || "").trim();
    const title = (row.title || row.case_title || row.case || "").trim();
    if (!client) warnings.push(`Row ${line}: missing client name — defaulted.`);
    if (!title) warnings.push(`Row ${line}: missing title — defaulted.`);

    let createdAt = now;
    const dateRaw = (row.date || row.created || row.created_at || row.opened || "").trim();
    if (dateRaw) {
      const { iso, format } = normalizeDate(dateRaw);
      dateFormats.add(format);
      if (iso) createdAt = iso;
      else warnings.push(`Row ${line}: could not read date "${dateRaw}" — used today's date.`);
    }

    const typeRaw = (row.case_type || row.type || row.category || "").trim();
    const caseType = CASE_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) || (typeRaw ? typeRaw : "Other");

    const prRaw = (row.priority || "").trim().toLowerCase();
    let priority: CaseItem["priority"] = "medium";
    if (prRaw) {
      if ((PRIORITIES as readonly string[]).includes(prRaw)) priority = prRaw as CaseItem["priority"];
      else warnings.push(`Row ${line}: unknown priority "${row.priority}" — set to medium.`);
    }

    const stRaw = (row.status || "").trim().toLowerCase().replace(/_/g, " ");
    let status: CaseStatus = "awaiting_review";
    if (stRaw) {
      const key = stRaw.replace(/ /g, "_");
      if ((CASE_STATUSES as string[]).includes(key)) status = key as CaseStatus;
      else if (STATUS_ALIASES[stRaw]) status = STATUS_ALIASES[stRaw];
      else warnings.push(`Row ${line}: unknown status "${row.status}" — set to awaiting review.`);
    }

    return {
      id: uid(),
      caseNumber: "",
      title: title || `Imported case for ${client || "client"}`,
      clientName: client || `Imported Client ${idx + 1}`,
      caseType,
      status,
      priority,
      description: (row.description || "").trim() || `Imported via CSV on ${new Date().toLocaleDateString("en-US")}.`,
      assignedTo: (row.assigned_to || row.assignee || "").trim() || "Imported",
      createdAt,
      updatedAt: now,
      completeness: 0,
    };
  });

  return { items, warnings, dateFormats: [...dateFormats] };
}

// Deduplicates by client + title (case-insensitive). Returns the fresh items
// and the number of duplicates skipped. Used by both the API bulk import and
// the unit tests so behavior is identical everywhere.
export function dedupeCases<T extends Pick<CaseItem, "clientName" | "title">>(items: T[], existing: Pick<CaseItem, "clientName" | "title">[]): { fresh: T[]; skipped: number } {
  const keys = new Set(existing.map((c) => (c.clientName + "|" + c.title).toLowerCase()));
  const fresh: T[] = [];
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
