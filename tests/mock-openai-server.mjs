#!/usr/bin/env node
// Mock OpenAI-compatible Chat Completions server, for local testing of the
// Live AI path without a real provider key or network access.
//
//   node tests/mock-openai-server.mjs [port]        # default 4010
//   curl localhost:4010/__scenario/contradiction    # choose the behaviour
//   curl localhost:4010/__calls                     # see what the app sent
//
// Point the app at it with:
//   LLM_API_KEY=test-key LLM_BASE_URL=http://127.0.0.1:4010/v1 LLM_MODEL=mock-llm
//
// This is a TEST DOUBLE, not a real model. It grounds its answers in the
// documents it receives (it parses the same DOCUMENT/PAGE markers the app
// sends) so citation verification is exercised for real.

import http from "node:http";

const PORT = Number(process.argv[2]) || 4010;

const SCENARIOS = new Set([
  "normal", "consistent", "contradiction", "missing", "ambiguous",
  "unsupported", "invalid-citation", "invalid-json", "timeout",
  "error-401", "error-429", "error-500",
]);

let scenario = "normal";
const calls = [];

// --- prompt parsing (same markers as src/lib/llm.ts buildPrompt) -------------
function parsePrompt(text) {
  const docs = [];
  const parts = text.split(/^=== DOCUMENT: (.+) ===$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim();
    const body = parts[i + 1] || "";
    const pages = [];
    const pageParts = body.split(/^--- PAGE (\d+) ---$/m);
    for (let j = 1; j < pageParts.length; j += 2) pages.push(pageParts[j + 1] || "");
    if (!pages.length) pages.push(body);
    docs.push({ name, pages });
  }
  return docs;
}

function snippetAround(page, idx, len) {
  return page.slice(Math.max(0, idx - 30), idx + len + 30).replace(/\s+/g, " ").trim();
}

// Finds a grounded fact in the documents: a money amount with its verbatim quote.
function findMoneyFact(docs) {
  const re = /\$\s?\d[\d,]*(?:\.\d{1,2})?/;
  for (const d of docs) {
    for (let p = 0; p < d.pages.length; p++) {
      const m = re.exec(d.pages[p]);
      if (m) return { doc: d.name, page: p + 1, value: m[0], snippet: snippetAround(d.pages[p], m.index, m[0].length) };
    }
  }
  return null;
}

function findDateFact(docs) {
  const re = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/;
  for (const d of docs) {
    for (let p = 0; p < d.pages.length; p++) {
      const m = re.exec(d.pages[p]);
      if (m) return { doc: d.name, page: p + 1, value: m[0], snippet: snippetAround(d.pages[p], m.index, m[0].length) };
    }
  }
  return null;
}

function fact(f, field, category) {
  return { field, value: f.value, confidence: 92, sourceDoc: f.doc, sourcePage: f.page, snippet: f.snippet, category };
}

function payloadFor(scenario, docs) {
  const money = findMoneyFact(docs);
  const date = findDateFact(docs);
  const facts = [];
  if (money) facts.push(fact(money, "Amount", "financial"));
  if (date) facts.push(fact(date, "Date", "date"));

  const base = {
    facts,
    contradictions: [],
    missing: [],
    recommendation: {
      title: "Recommend: Proceed — documents are consistent",
      summary: "The uploaded documents support the next step and no conflicts were found.",
      reasoning: "Facts were extracted from the provided documents and each is cited to its source page.",
      confidence: 82,
      sufficientEvidence: true,
      evidence: facts.slice(0, 3).map((f) => ({ claim: `${f.field}: ${f.value}`, doc: f.sourceDoc, page: f.sourcePage, snippet: f.snippet })),
      missingInfo: [],
      uncertainties: ["Confidence is an uncalibrated heuristic, not a verified probability."],
      nextSteps: ["Verify the cited facts against the original documents", "Record the human decision in the audit trail"],
    },
  };

  switch (scenario) {
    case "consistent":
      return base;
    case "missing":
      return {
        ...base,
        missing: ["Government ID", "Proof of Income"],
        recommendation: {
          ...base.recommendation,
          title: "Recommend: Obtain the remaining documents first",
          summary: "Some required documents are not in the file.",
          missingInfo: ["Government ID", "Proof of Income"],
          nextSteps: ["Request the missing documents from the client"],
        },
      };
    case "ambiguous":
      return {
        ...base,
        recommendation: {
          ...base.recommendation,
          title: "Recommend: Clarify the ambiguous statements with the client",
          summary: "Some statements in the documents can be read more than one way.",
          uncertainties: ["One statement is ambiguous and could change the analysis.", "Confidence is an uncalibrated heuristic, not a verified probability."],
        },
      };
    case "unsupported":
      return {
        ...base,
        recommendation: {
          ...base.recommendation,
          title: "Insufficient evidence — the documents do not support a conclusion",
          summary: "The file does not contain enough information to recommend a next step.",
          confidence: 88,
          sufficientEvidence: false,
          evidence: [],
          missingInfo: ["Enough documentation to support a conclusion"],
          uncertainties: ["No supporting evidence could be cited."],
          nextSteps: ["Gather more documents before deciding"],
        },
      };
    case "invalid-citation":
      return {
        ...base,
        facts: [{ field: "Income", value: "$99,999", confidence: 99, sourceDoc: "Not_In_The_File.pdf", sourcePage: 1, snippet: "Quotation that does not exist anywhere", category: "financial" }],
        recommendation: {
          ...base.recommendation,
          evidence: [{ claim: "Income is $99,999", doc: "Not_In_The_File.pdf", page: 1, snippet: "Quotation that does not exist anywhere" }],
        },
      };
    case "contradiction": {
      const a = findMoneyFact(docs);
      const second = docs.length > 1 ? findMoneyFact(docs.slice(1)) : null;
      const evidence = [];
      if (a) evidence.push({ value: a.value, doc: a.doc, page: a.page, snippet: a.snippet });
      if (second) evidence.push({ value: second.value, doc: second.doc, page: second.page, snippet: second.snippet });
      if (evidence.length < 2 && a) evidence.push({ value: a.value, doc: a.doc, page: a.page, snippet: a.snippet });
      return {
        ...base,
        contradictions: [{
          field: "Amount",
          description: "Two documents state different amounts; confirm which one is current.",
          evidence,
        }],
        recommendation: {
          ...base.recommendation,
          title: "Recommend: Investigate the conflicting amounts before filing",
          summary: "Documents disagree on a figure. Reconcile it with the client first.",
          confidence: 70,
          evidence: evidence.map((e) => ({ claim: `Amount stated as ${e.value}`, doc: e.doc, page: e.page, snippet: e.snippet })),
          uncertainties: ["The documents may reflect different dates — verify which figure is current."],
          nextSteps: ["Review both amounts with the client and the source documents"],
        },
      };
    }
    default:
      return base;
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/__scenario" || url.pathname.startsWith("/__scenario/")) {
    const next = url.pathname.slice("/__scenario/".length);
    if (!SCENARIOS.has(next)) return json(400, { error: `unknown scenario; use one of ${[...SCENARIOS].join(", ")}` });
    scenario = next;
    return json(200, { scenario });
  }
  if (url.pathname === "/__calls") return json(200, { scenario, count: calls.length, calls: calls.slice(-5) });
  if (url.pathname === "/__reset") { calls.length = 0; scenario = "normal"; return json(200, { ok: true }); }

  if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
    return json(404, { error: "not found" });
  }

  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: "bad json" }); }
    calls.push({ model: body.model, messages: (body.messages || []).map((m) => m.content.length), at: new Date().toISOString() });

    if (scenario === "timeout") return setTimeout(() => json(200, { choices: [{ message: { content: "{}" } }] }), 15000);
    if (scenario === "error-401") return json(401, { error: { message: "invalid api key" } });
    if (scenario === "error-429") return json(429, { error: { message: "rate limit exceeded" } });
    if (scenario === "error-500") return json(500, { error: { message: "upstream failure" } });
    if (scenario === "invalid-json") {
      return json(200, { choices: [{ message: { content: "this is not JSON" } }] });
    }

    const user = (body.messages || []).find((m) => m.role === "user");
    const docs = parsePrompt(user ? user.content : "");
    const payload = payloadFor(scenario, docs);
    return json(200, { model: body.model, choices: [{ message: { role: "assistant", content: JSON.stringify(payload) } }] });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock OpenAI-compatible server on http://127.0.0.1:${PORT}/v1 (scenario: ${scenario})`);
});
