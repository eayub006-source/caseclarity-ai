#!/usr/bin/env node
// End-to-end check of the Live AI path against the mock provider.
//
//   node tests/mock-openai-server.mjs 4010     # terminal 1
//   npm run dev                                # terminal 2 (with .env pointing at the mock)
//   node tests/e2e-live-ai.mjs                # terminal 3
//
// Exercises every failure mode and prints a pass/fail table. Uses fictional
// documents only.

const APP = process.env.APP_BASE || "http://127.0.0.1:3000";
const MOCK = process.env.MOCK_BASE || "http://127.0.0.1:4010";

const DOCS = [
  { id: "doc-1", name: "Lease_Agreement.txt", extractedText: "LEASE AGREEMENT between Sunset Properties LLC and Maria Gonzalez. Premises: 412 Elm Street, Apt 3B. Monthly rent $1,450. Lease term: Jan 1, 2026 to Dec 31, 2026." },
  { id: "doc-2", name: "Eviction_Notice.txt", extractedText: "NOTICE TO VACATE — 14 DAYS. Dated April 25, 2026. Tenant Maria Gonzalez is in arrears $2,900 (2 months). Payment or vacatur due by May 9, 2026." },
];

const CASE = { title: "Eviction Defense", clientName: "Maria Gonzalez", caseType: "Housing / Eviction" };

const setScenario = async (s) => {
  const r = await fetch(`${MOCK}/__scenario/${s}`);
  if (!r.ok) throw new Error(`cannot set scenario ${s}: ${await r.text()}`);
};

const analyze = async (documents = DOCS) => {
  const r = await fetch(`${APP}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ case: CASE, documents }),
  });
  return { status: r.status, body: await r.json() };
};

let failures = 0;
async function check(name, scenario, docs, verify) {
  await setScenario(scenario);
  const { status, body } = await analyze(docs);
  let ok = true;
  let detail = "";
  try {
    const v = verify(body, status);
    ok = v === true || v === undefined;
    if (typeof v === "string") { ok = false; detail = v; }
  } catch (e) { ok = false; detail = String(e.message || e); }
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) console.log("      " + JSON.stringify(body).slice(0, 400));
}

const isLlm = (b) => b.mode === "llm";

const config = await (await fetch(`${APP}/api/config`)).json();
console.log(`config: ${JSON.stringify(config)}\n`);

await check("1. normal document, identifiable facts", "normal", undefined, (b) => {
  if (!isLlm(b)) return `expected mode llm, got ${JSON.stringify(b).slice(0, 120)}`;
  const f = b.result.facts.find((x) => x.fieldName === "Amount");
  if (!f) return "no Amount fact extracted";
  if (!f.verified || f.documentId !== "doc-1") return `fact not verified/linked: ${JSON.stringify(f)}`;
  return b.result.recommendation.evidence.length >= 1 || "no evidence cited";
});

await check("2. multiple documents, consistent", "consistent", DOCS, (b) => isLlm(b) || "expected mode llm");

await check("3. contradictory information", "contradiction", DOCS, (b) => {
  if (!isLlm(b)) return "expected mode llm";
  const c = b.result.contradictions[0];
  if (!c) return "no contradiction returned";
  if (c.evidence.length < 2) return "contradiction has fewer than two sides";
  if (!c.evidence.every((e) => e.verified && e.doc && e.page >= 1)) return "a contradiction side is not traceable: " + JSON.stringify(c.evidence);
  return true;
});

await check("4. missing important information", "missing", DOCS, (b) => {
  if (!isLlm(b)) return "expected mode llm";
  return b.result.recommendation.missingInfo.length >= 1 || "missingInfo is empty";
});

await check("5. ambiguous statements", "ambiguous", DOCS, (b) => {
  if (!isLlm(b)) return "expected mode llm";
  return b.result.recommendation.uncertainties.length >= 2 || "ambiguity not surfaced in uncertainties";
});

await check("6. conclusion not supported by the documents", "unsupported", DOCS, (b) => {
  if (!isLlm(b)) return "expected mode llm";
  if (b.result.recommendation.sufficientEvidence !== false) return "sufficientEvidence not false";
  return b.result.recommendation.confidence <= 60 || `confidence not capped: ${b.result.recommendation.confidence}`;
});

await check("7. invalid / nonexistent citation", "invalid-citation", DOCS, (b) => {
  if (!isLlm(b)) return "expected mode llm";
  const f = b.result.facts.find((x) => x.sourceDoc === "Not_In_The_File.pdf");
  if (!f) return "the fabricated citation is missing from the result";
  if (f.verified) return "fabricated citation was marked verified";
  if (f.documentId !== null) return "fabricated citation was linked to a real document";
  return b.result.unverifiedCount >= 1 || "unverified citation not counted";
});

await check("8. provider timeout", "timeout", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /timed out/i.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await check("9. invalid provider response (bad JSON)", "invalid-json", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /invalid JSON/i.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await check("10. unavailable API key (HTTP 401)", "error-401", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /HTTP 401/.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await check("11. rate limited (HTTP 429)", "error-429", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /rate limit/i.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await check("12. provider failure (HTTP 500)", "error-500", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /HTTP 500/.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await check("13. transient 503 recovers on retry", "flaky-503", DOCS, (b) => {
  if (!isLlm(b)) return `expected mode llm, got ${JSON.stringify(b).slice(0, 120)}`;
  return (b.attempts ?? 0) >= 3 || `expected at least 3 attempts, got ${b.attempts}`;
});

await check("14. persistent 503 exhausts retries and falls back to demo", "error-503", DOCS, (b) => {
  if (b.mode !== "demo") return `expected demo fallback, got mode ${b.mode}`;
  return /503/.test(b.reason) || `unexpected reason: ${b.reason}`;
});

await setScenario("normal");
console.log(`\n${failures === 0 ? "ALL SCENARIOS PASSED" : failures + " SCENARIO(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
