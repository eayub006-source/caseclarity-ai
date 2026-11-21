import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../src/app/api/analyze/route";

// End-to-end tests for the Live AI route: the response contract, the safety
// checks and every failure path must degrade honestly to Demo Mode.

const CASE = { case: { title: "Eviction", clientName: "Maria Gonzalez", caseType: "Housing / Eviction" } };
const DOCS = { documents: [{ id: "doc-1", name: "Lease.pdf", extractedText: "Tenant Maria Gonzalez. Monthly rent $1,450." }] };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function llmResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_PAYLOAD = {
  facts: [{ field: "Rent", value: "$1,450", confidence: 95, sourceDoc: "Lease.pdf", sourcePage: 1, snippet: "Monthly rent $1,450", category: "financial" }],
  contradictions: [],
  missing: [],
  recommendation: {
    title: "Recommend: Proceed",
    summary: "Documents are consistent.",
    reasoning: "Rent is documented.",
    confidence: 80,
    sufficientEvidence: true,
    evidence: [{ claim: "Rent is $1,450", doc: "Lease.pdf", page: 1, snippet: "Monthly rent $1,450" }],
    missingInfo: [],
    uncertainties: [],
    nextSteps: ["Verify against the original lease"],
  },
};

describe("POST /api/analyze", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = {
      ...env,
      LLM_API_KEY: "test-key",
      LLM_BASE_URL: "http://llm.test/v1",
      LLM_MODEL: "test-model",
      LLM_FALLBACK_MODELS: "fallback-model",
      // Keep the suite fast: the tests assert attempt counts, not timings.
      LLM_RETRY_BASE_DELAY_MS: "0",
    };
  });
  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("answers demo mode without a key, and never calls the provider", async () => {
    process.env.LLM_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ ...CASE, ...DOCS }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "demo" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks cross-site requests", async () => {
    const res = await POST(req({ ...CASE, ...DOCS }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("rejects a request with no documents", async () => {
    const res = await POST(req({ ...CASE, documents: [] }));
    expect(res.status).toBe(400);
  });

  it("returns the LLM result with verified citations when the provider succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => llmResponse(VALID_PAYLOAD)));
    const res = await POST(req({ ...CASE, ...DOCS }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("llm");
    expect(body.model).toBe("test-model");
    expect(body.result.facts[0]).toMatchObject({ fieldName: "Rent", documentId: "doc-1", verified: true });
    expect(body.result.recommendation.evidence[0].verified).toBe(true);
  });

  it("marks a citation to an unknown document as unverified", async () => {
    const payload = {
      ...VALID_PAYLOAD,
      facts: [{ ...VALID_PAYLOAD.facts[0], sourceDoc: "Ghost.pdf", snippet: "not in the file" }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => llmResponse(payload)));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.result.facts[0].verified).toBe(false);
    expect(body.result.facts[0].documentId).toBeNull();
    expect(body.result.facts[0].confidence).toBeLessThanOrEqual(40);
    expect(body.result.unverifiedCount).toBe(1);
  });

  it("falls back to demo mode when the provider returns an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 500 })));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/HTTP 500/);
  });

  it("names rate limiting explicitly on HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/rate limit/i);
  });

  it("retries a transient 503 and still returns the LLM result", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      return calls < 2
        ? new Response(JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }), { status: 503 })
        : llmResponse(VALID_PAYLOAD);
    }));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("llm");
    expect(body.model).toBe("test-model");
    expect(calls).toBe(2);
  });

  it("uses the fallback model when the primary is unavailable, and says so", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push(body.model);
      if (body.model === "test-model") return new Response("overloaded", { status: 503 });
      return llmResponse(VALID_PAYLOAD);
    }));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("llm");
    expect(body.model).toBe("fallback-model");
    expect(body.primaryModel).toBe("test-model");
    expect(body.fallbackUsed).toBe(true);
    expect(seen).toEqual(["test-model", "test-model", "fallback-model"]);
  });

  it("does not retry a 401", async () => {
    const fetchMock = vi.fn(async () => new Response("Incorrect API key provided", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to demo after exhausting retries on persistent 503", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 503, message: "high demand", status: "UNAVAILABLE" } }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to demo mode when the provider returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 })));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/invalid JSON/);
  });

  it("falls back to demo mode when the provider output fails validation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => llmResponse({ facts: [] })));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/rejected/);
  });

  it("falls back to demo mode when the provider times out", async () => {
    process.env.LLM_TIMEOUT_MS = "20";
    // The timeout is clamped to a 5 s floor, so a single attempt keeps this
    // test quick while still exercising the timeout path.
    process.env.LLM_MAX_ATTEMPTS = "1";
    const fetchMock = vi.fn(async (_url: string | URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/timed out/i);
  });

  it("falls back to demo mode when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket closed"); }));
    const body = await (await POST(req({ ...CASE, ...DOCS }))).json();
    expect(body.mode).toBe("demo");
    expect(body.reason).toMatch(/network error/i);
  });
});
