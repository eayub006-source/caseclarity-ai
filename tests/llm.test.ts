import { describe, it, expect, vi } from "vitest";
import { validateLlmResult, buildPrompt, postChatCompletion, LlmError } from "../src/lib/llm";

const docs = [
  { id: "doc-1", name: "Lease.pdf", extractedText: "Page one text.\fTenant Maria Gonzalez. Monthly rent $1,450." },
  { id: "doc-2", name: "Notice.pdf", extractedText: "Arrears $2,900 due by May 9, 2026." },
];

const good = {
  facts: [
    { field: "Rent", value: "$1,450", confidence: 95, sourceDoc: "Lease.pdf", sourcePage: 1, snippet: "Monthly rent $1,450", category: "financial" },
    { field: "Deadline", value: "May 9, 2026", confidence: 90, sourceDoc: "notice.PDF", sourcePage: 1, snippet: "due by May 9, 2026", category: "date" },
    { field: "Income", value: "$5,000", confidence: 99, sourceDoc: "Paystub.pdf", sourcePage: 1, snippet: "Gross $5,000", category: "financial" },
    { field: "Bogus", value: "x", confidence: 99, sourceDoc: "Lease.pdf", sourcePage: 1, snippet: "this text is not in the lease at all", category: "fact" },
  ],
  contradictions: [
    {
      field: "Monthly amount",
      description: "The lease says $1,450/month while the notice claims $2,900 is owed.",
      evidence: [
        { value: "$1,450", doc: "Lease.pdf", page: 1, snippet: "Monthly rent $1,450" },
        { value: "$2,900", doc: "Notice.pdf", page: 1, snippet: "Arrears $2,900 due by May 9, 2026" },
      ],
    },
  ],
  missing: ["Government ID"],
  recommendation: {
    title: "Recommend: Proceed",
    summary: "Looks fine.",
    reasoning: "Because.",
    confidence: 140,
    sufficientEvidence: true,
    evidence: [{ claim: "Rent is $1,450", doc: "Lease.pdf", page: 7, snippet: "Monthly rent $1,450" }],
    missingInfo: [],
    uncertainties: [],
    nextSteps: ["Call client"],
  },
};

describe("LLM output validation", () => {
  const r = validateLlmResult(good, docs);

  it("links facts to the real document and corrects the page from the snippet", () => {
    const rent = r.facts.find((f) => f.fieldName === "Rent")!;
    expect(rent.documentId).toBe("doc-1");
    expect(rent.sourcePage).toBe(2); // the model said page 1; the text is on page 2
    expect(rent.verified).toBe(true);
  });

  it("matches document names case-insensitively", () => {
    expect(r.facts.find((f) => f.fieldName === "Deadline")!.documentId).toBe("doc-2");
  });

  it("never attaches an unknown document to another document", () => {
    const inc = r.facts.find((f) => f.fieldName === "Income")!;
    expect(inc.documentId).toBeNull();
    expect(inc.verified).toBe(false);
    expect(inc.confidence).toBeLessThanOrEqual(40);
  });

  it("marks a quote that is not in the document as unverified", () => {
    const bogus = r.facts.find((f) => f.fieldName === "Bogus")!;
    expect(bogus.verified).toBe(false);
    expect(r.unverifiedCount).toBe(2);
    expect(r.recommendation.uncertainties[0]).toMatch(/could not be matched/);
  });

  it("clamps confidence and fixes evidence pages", () => {
    expect(r.recommendation.confidence).toBe(100);
    expect(r.recommendation.evidence[0].page).toBe(2);
    expect(r.recommendation.evidence[0].verified).toBe(true);
  });

  it("keeps a contradiction whose sides both verify, with their real pages", () => {
    expect(r.contradictions).toHaveLength(1);
    const c = r.contradictions[0];
    expect(c.field).toBe("Monthly amount");
    expect(c.evidence).toHaveLength(2);
    expect(c.evidence.every((e) => e.verified)).toBe(true);
    expect(c.evidence.map((e) => e.doc).sort()).toEqual(["Lease.pdf", "Notice.pdf"]);
    expect(c.evidence.find((e) => e.doc === "Lease.pdf")!.page).toBe(2);
  });

  it("drops a contradiction with fewer than two verified sides", () => {
    const bad = {
      ...good,
      contradictions: [{
        field: "Income",
        description: "Conflicting income figures.",
        evidence: [
          { value: "$62,000", doc: "Ghost.pdf", page: 1, snippet: "not in any document" },
          { value: "$69,600", doc: "Notice.pdf", page: 1, snippet: "Arrears $2,900 due by May 9, 2026" },
        ],
      }],
    };
    const out = validateLlmResult(bad, docs);
    expect(out.contradictions).toHaveLength(0);
  });

  it("drops a contradiction when one of its two sides cannot be verified, and counts it", () => {
    const partial = {
      ...good,
      contradictions: [{
        field: "Amount",
        description: "Two different amounts.",
        evidence: [
          { value: "$1,450", doc: "Lease.pdf", page: 1, snippet: "Monthly rent $1,450" },
          { value: "$9,999", doc: "Lease.pdf", page: 1, snippet: "this amount is not in the lease" },
        ],
      }],
    };
    const out = validateLlmResult(partial, docs);
    expect(out.contradictions).toHaveLength(0);
    expect(out.unverifiedCount).toBeGreaterThanOrEqual(1);
  });

  it("corrects the page of each contradiction side from its snippet", () => {
    const moved = {
      ...good,
      contradictions: [{
        field: "Amount",
        description: "Two different amounts.",
        evidence: [
          { value: "$1,450", doc: "Lease.pdf", page: 1, snippet: "Monthly rent $1,450" },
          { value: "$2,900", doc: "Notice.pdf", page: 3, snippet: "Arrears $2,900 due by May 9, 2026" },
        ],
      }],
    };
    const out = validateLlmResult(moved, docs);
    expect(out.contradictions[0].evidence[0].page).toBe(2);
    expect(out.contradictions[0].evidence[1].page).toBe(1);
  });

  it("flags insufficient evidence, caps confidence and adds an uncertainty", () => {
    const out = validateLlmResult({ ...good, recommendation: { ...good.recommendation, sufficientEvidence: false, title: "Maybe proceed", summary: "Possibly fine." } }, docs);
    expect(out.recommendation.sufficientEvidence).toBe(false);
    expect(out.recommendation.confidence).toBeLessThanOrEqual(60);
    expect(out.recommendation.uncertainties.join(" ")).toMatch(/insufficient/i);
  });

  it("warns when the recommendation cites no evidence at all", () => {
    const out = validateLlmResult({ ...good, recommendation: { ...good.recommendation, evidence: [] } }, docs);
    expect(out.recommendation.uncertainties.join(" ")).toMatch(/no supporting evidence/i);
  });

  it("falls back to the top-level missing list when missingInfo is empty", () => {
    expect(r.recommendation.missingInfo).toEqual(["Government ID"]);
  });

  it("rejects output without a usable recommendation", () => {
    expect(() => validateLlmResult({ facts: [] }, docs)).toThrow();
    expect(() => validateLlmResult("nope", docs)).toThrow();
    expect(() => validateLlmResult({ recommendation: { title: "" } }, docs)).toThrow();
  });

  it("marks document and page boundaries in the prompt", () => {
    const p = buildPrompt({ clientName: "Maria Gonzalez", caseType: "Housing / Eviction", title: "Eviction" }, docs, ["Lease Agreement"]);
    expect(p).toContain("=== DOCUMENT: Lease.pdf ===");
    expect(p).toContain("--- PAGE 2 ---");
  });
});

describe("postChatCompletion (provider call)", () => {
  const cfg = { baseUrl: "https://llm.example/v1", apiKey: "secret-key", model: "test-model", timeoutMs: 5000, retryBaseDelayMs: 0 };
  const messages = [{ role: "user", content: "hello" }];
  const okBody = { choices: [{ message: { content: "{\"ok\":true}" } }] };

  it("posts the OpenAI-compatible request and returns the message content", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string | URL, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    await expect(postChatCompletion(cfg, messages, fetchImpl)).resolves.toMatchObject({
      content: "{\"ok\":true}",
      model: "test-model",
      primaryModel: "test-model",
      fallbackUsed: false,
      attempts: 1,
    });
    expect(seen!.url).toBe("https://llm.example/v1/chat/completions");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual(messages);
  });

  it("sends the lowest supported reasoning effort so long reasoning cannot exhaust the timeout", async () => {
    let seen: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string | URL, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    await postChatCompletion(cfg, messages, fetchImpl);
    const body = JSON.parse(seen!.init.body as string);
    // gemini-3.8-flash supports low/medium/high and defaults to medium;
    // "minimal" is rejected (HTTP 400), so "low" is the lowest valid level.
    expect(body.reasoning_effort).toBe("low");
  });

  it("never sends a thinking_config alongside reasoning_effort (they conflict)", async () => {
    let seen: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string | URL, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    await postChatCompletion(cfg, messages, fetchImpl);
    const body = JSON.parse(seen!.init.body as string);
    expect(body).not.toHaveProperty("thinking_config");
    expect(body).not.toHaveProperty("thinking_level");
    expect(body).not.toHaveProperty("thinking_budget");
  });

  const jsonFetch = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

  // --- authentication: never retried, never fallen back -----------------------

  it("does not retry an authentication failure (401)", async () => {
    const fetchImpl = vi.fn(jsonFetch(401, { error: { message: "Incorrect API key provided" } }));
    await expect(postChatCompletion(cfg, messages, fetchImpl)).rejects.toMatchObject({ name: "LlmError", status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry or fall back on 403 — every model uses the same key", async () => {
    const fetchImpl = vi.fn(jsonFetch(403, { error: { message: "forbidden" } }));
    await expect(postChatCompletion({ ...cfg, fallbackModels: ["fallback-model"] }, messages, fetchImpl)).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on a non-transient HTTP error (400)", async () => {
    const fetchImpl = vi.fn(jsonFetch(400, { error: { message: "bad request" } }));
    await expect(postChatCompletion(cfg, messages, fetchImpl)).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // --- transient faults: retried with backoff --------------------------------

  it("retries a transient 429 and succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return calls < 2
        ? new Response("slow down", { status: 429 })
        : new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(postChatCompletion(cfg, messages, fetchImpl)).resolves.toMatchObject({ content: "{\"ok\":true}", attempts: 2, fallbackUsed: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honours the provider's Retry-After header", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("slow down", { status: 429, headers: { "Retry-After": "1" } });
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const started = Date.now();
    await expect(postChatCompletion(cfg, messages, fetchImpl)).resolves.toMatchObject({ attempts: 2 });
    // The base backoff is 0 in tests, so the wait came from Retry-After.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("retries a transient 503 and succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return calls < 3
        ? new Response(JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }), { status: 503 })
        : new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(postChatCompletion(cfg, messages, fetchImpl)).resolves.toMatchObject({ content: "{\"ok\":true}", attempts: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after the bounded number of attempts when 503 persists", async () => {
    const fetchImpl = vi.fn(jsonFetch(503, { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }));
    await expect(postChatCompletion({ ...cfg, maxAttempts: 3 }, messages, fetchImpl)).rejects.toThrow(/HTTP 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries a timeout", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      calls++;
      if (calls < 2) {
        return new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(postChatCompletion({ ...cfg, timeoutMs: 20 }, messages, fetchImpl)).resolves.toMatchObject({ attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  // --- model fallback chain ---------------------------------------------------

  it("falls back to the next model when the primary is unavailable", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push(body.model);
      if (body.model === "test-model") return new Response("overloaded", { status: 503 });
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(postChatCompletion({ ...cfg, fallbackModels: ["fallback-model"], maxAttempts: 3 }, messages, fetchImpl))
      .resolves.toMatchObject({ content: "{\"ok\":true}", model: "fallback-model", primaryModel: "test-model", fallbackUsed: true, attempts: 3 });
    expect(seen).toEqual(["test-model", "test-model", "fallback-model"]);
  });

  it("skips a fallback model whose ID is unknown (404) instead of retrying it", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push(body.model);
      if (body.model === "good-model") return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
      if (body.model === "ghost-model") return new Response("not found", { status: 404 });
      return new Response("overloaded", { status: 503 });
    }) as unknown as typeof fetch;
    await expect(postChatCompletion({ ...cfg, fallbackModels: ["ghost-model", "good-model"], maxAttempts: 4 }, messages, fetchImpl))
      .resolves.toMatchObject({ model: "good-model", fallbackUsed: true });
    expect(seen).toEqual(["test-model", "test-model", "ghost-model", "good-model"]);
  });

  it("reports every model it tried when the whole chain is exhausted", async () => {
    const fetchImpl = vi.fn(jsonFetch(503, { error: { message: "overloaded" } }));
    const err = await postChatCompletion({ ...cfg, fallbackModels: ["fallback-model"], maxAttempts: 3 }, messages, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toContain("test-model");
    expect(err.message).toContain("fallback-model");
    expect(err.message).toContain("3 attempt(s)");
  });

  it("throws LlmError when the request times out", async () => {
    const fetchImpl = (async (_url: string | URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as unknown as typeof fetch;
    await expect(postChatCompletion({ ...cfg, timeoutMs: 20 }, messages, fetchImpl)).rejects.toThrow(/timed out/i);
  });

  it("throws LlmError on a network failure", async () => {
    const fetchImpl = (async () => { throw new Error("socket closed"); }) as unknown as typeof fetch;
    await expect(postChatCompletion(cfg, messages, fetchImpl)).rejects.toThrow(/network error/i);
  });

  it("throws LlmError when the body has no usable content", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(postChatCompletion(cfg, messages, fetchImpl)).rejects.toBeInstanceOf(LlmError);
    const badJson = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(postChatCompletion(cfg, messages, badJson)).rejects.toBeInstanceOf(LlmError);
  });
});
