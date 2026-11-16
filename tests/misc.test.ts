import { describe, it, expect } from "vitest";
import { normalizeRole, canManage } from "../src/lib/roles";
import { hit, peek, reset, reserve, clientIp } from "../src/lib/rate-limit";
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

  it("reserve counts atomically and refunds on success", () => {
    const k1 = "r1:" + Math.random(), k2 = "r2:" + Math.random();
    const slots = Array.from({ length: 5 }, () => reserve([[k1, 3], [k2, 100]], 1000, 0));
    expect(slots.filter((x) => x.allowed).length).toBe(3); // the 4th and 5th are refused immediately
    const first = slots[0];
    if (first.allowed) { first.refund(); first.refund(); } // refund is idempotent
    expect(reserve([[k1, 3]], 1000, 0).allowed).toBe(true);
    expect(reserve([[k1, 3]], 1000, 0).allowed).toBe(false);
    expect(peek(k2, 100, 0).allowed).toBe(true); // refused attempts did not leak onto k2
    reset(k1); reset(k2);
  });

  it("peek checks the limit without counting an attempt", () => {
    const key = "p:" + Math.random();
    for (let i = 0; i < 5; i++) expect(peek(key, 2, 0).allowed).toBe(true);
    hit(key, 2, 1000, 0); hit(key, 2, 1000, 0);
    expect(peek(key, 2, 10).allowed).toBe(false);
    expect(peek(key, 2, 1001).allowed).toBe(true);
    reset(key);
  });
});

describe("client IP for rate limiting", () => {
  const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });
  it("ignores spoofable headers unless a trusted proxy is configured", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }), false)).toBeNull();
  });
  it("uses the right-most X-Forwarded-For hop (added by our proxy) when trusted", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }), true)).toBe("9.9.9.9");
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9", "x-real-ip": "6.6.6.6" }), true)).toBe("9.9.9.9");
    expect(clientIp(req({ "x-real-ip": "5.5.5.5" }), true)).toBe("5.5.5.5");
    expect(clientIp(req({}), true)).toBeNull();
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
