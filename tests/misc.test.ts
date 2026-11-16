import { describe, it, expect } from "vitest";
import { normalizeRole, canManage } from "../src/lib/roles";
import { hit, reset } from "../src/lib/rate-limit";
import { paginate, extractDocument } from "../src/lib/extract";
import { toCSV, parseCasesCSV, buildCasesFromRows, normalizeDate } from "../src/lib/csv";

describe("roles", () => {
  it("normalises legacy labels and keys", () => {
    expect(normalizeRole("Senior Case Worker")).toBe("senior_case_worker");
    expect(normalizeRole("case_worker")).toBe("case_worker");
    expect(normalizeRole(null)).toBe("case_worker");
    expect(canManage("Senior Case Worker")).toBe(true);
    expect(canManage("case_worker")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const key = "t:" + Math.random();
    for (let i = 0; i < 3; i++) expect(hit(key, 3, 1000, 0).allowed).toBe(true);
    const blocked = hit(key, 3, 1000, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(hit(key, 3, 1000, 1001).allowed).toBe(true);
    reset(key);
  });
});

describe("estimated pages for DOCX/TXT", () => {
  it("splits long text at word boundaries and keeps all the text", () => {
    const text = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
    const pages = paginate(text, 500);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join(" ")).toBe(text);
    expect(pages.every((p) => p.length <= 500)).toBe(true);
  });

  it("gives TXT files multiple pages so facts can cite page 2+", async () => {
    const r = await extractDocument(Buffer.from("x ".repeat(2000) + "Rent $1,450", "utf-8"), "long.txt");
    expect(r.pageCount).toBeGreaterThan(1);
    expect(r.text.split("\f").length).toBe(r.pageCount);
    expect(r.pagesEstimated).toBe(true);
  });

  it("rejects unsupported file types", async () => {
    await expect(extractDocument(Buffer.from("x"), "photo.png")).rejects.toThrow(/Unsupported/);
  });
});

describe("CSV export and import details", () => {
  it("quotes values containing commas, quotes and newlines (round-trips)", () => {
    const csv = toCSV(["client_name", "title"], [["Smith, John", 'He said "hi"\nnext line']]);
    const { rows } = parseCasesCSV(csv);
    expect(rows[0].client_name).toBe("Smith, John");
    expect(rows[0].title).toBe('He said "hi"\nnext line');
  });

  it("keeps the CSV date, priority and status", () => {
    const { rows } = parseCasesCSV("client_name,title,date,priority,status\nA,Case,05/01/2026,urgent,closed\nB,Case 2,2026-13-45,weird,\n");
    const { items, warnings } = buildCasesFromRows(rows);
    expect(items[0].createdAt.slice(0, 10)).toBe("2026-05-01");
    expect(items[0].priority).toBe("urgent");
    expect(items[0].status).toBe("completed");
    expect(items[1].priority).toBe("medium");
    expect(warnings.some((w) => /could not read date/.test(w))).toBe(true);
    expect(warnings.some((w) => /unknown priority/.test(w))).toBe(true);
  });

  it("normalises both date formats", () => {
    expect(normalizeDate("2026-05-02").iso?.slice(0, 10)).toBe("2026-05-02");
    expect(normalizeDate("5/2/2026").iso?.slice(0, 10)).toBe("2026-05-02");
    expect(normalizeDate("02/30/2026").iso).toBeNull();
  });
});
