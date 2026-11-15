import { describe, it, expect } from "vitest";
import { parseCasesCSV, buildCasesFromRows, dedupeCases } from "../src/lib/csv";

describe("CSV import (RFC 4180 via PapaParse)", () => {
  it("parses quoted fields containing commas", () => {
    const csv = 'client_name,title,case_type,date\n"Smith, John","Eviction, Phase 1",Housing / Eviction,05/01/2026\nJane Doe,Benefits Appeal,Benefits Appeal,2026-05-02\n';
    const { rows } = parseCasesCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].client_name).toBe("Smith, John");
    expect(rows[0].title).toBe("Eviction, Phase 1");
  });

  it("detects mixed date formats", () => {
    const csv = "client_name,title,date\nA,Case One,05/01/2026\nB,Case Two,2026-05-02\n";
    const { rows } = parseCasesCSV(csv);
    const { dateFormats } = buildCasesFromRows(rows);
    expect(dateFormats).toContain("MM/DD/YYYY");
    expect(dateFormats).toContain("YYYY-MM-DD");
  });

  it("warns about missing columns and fills defaults", () => {
    const csv = "notes,extra\nhello,world\n";
    const { rows, headers } = parseCasesCSV(csv);
    expect(headers).toContain("notes");
    const { items, warnings } = buildCasesFromRows(rows);
    expect(items).toHaveLength(1);
    expect(items[0].clientName).toMatch(/^Imported Client/);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("deduplicates by client + title", () => {
    const csv = "client_name,title\nSarah Miller,Eviction Defense\nSarah Miller,Eviction Defense\nTom Baker,Benefits Appeal\n";
    const { rows } = parseCasesCSV(csv);
    const { items } = buildCasesFromRows(rows);
    const { fresh, skipped } = dedupeCases(items, []);
    expect(fresh).toHaveLength(2);
    expect(skipped).toBe(1);
    // Against an existing list, everything is a duplicate.
    const again = dedupeCases(items, items);
    expect(again.fresh).toHaveLength(0);
    expect(again.skipped).toBe(3);
  });
});
