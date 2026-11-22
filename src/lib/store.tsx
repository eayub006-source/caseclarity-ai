"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { CaseItem, DocItem, Extraction, Recommendation, User, AppConfig } from "./core";
import { canManage } from "./roles";
import type { VerifiedResult } from "./llm";
import { MAX_PROMPT_CHARS } from "./llm";
import { kvDelete, kvGet, kvSet } from "./browser-db";
import { authenticate, createAccount, findUser, type LocalAccount } from "./accounts";
import { deleteStoredSummaries, saveCaseSummaries, syncCaseSummaries } from "./summaries";
import * as W from "./workspace";

export interface ExtractResponse { name: string; text: string; pageCount: number; type: string; pagesEstimated: boolean; warning?: string; }
export type AnalyzeResponse =
  | {
      mode: "llm";
      /** The model that actually answered — the primary or a fallback. */
      model: string;
      /** The configured primary model, whether or not it answered. */
      primaryModel?: string;
      /** True when a fallback model stood in for an unavailable primary. */
      fallbackUsed?: boolean;
      /** Total provider attempts made across the model chain. */
      attempts?: number;
      result: VerifiedResult;
    }
  | { mode: "demo"; reason: string };

// The app's single data gateway. The workspace starts as a copy of the
// fictional dataset in src/data/demo-data.ts and every change is saved in this
// browser (IndexedDB, see ./browser-db.ts). Each visitor therefore has a
// private copy, and "Reset demo data" restores it. The rules (validation, case
// numbers, locked reviews, append-only audit) live in ./workspace.ts.
//
// The one exception is AI document summaries: Live AI mirrors them to
// Cloudflare D1 through /api/summaries and loads them back when a case opens,
// scoped by this workspace's token. The browser copy is the source of truth
// when D1 is missing or a call fails; Demo Mode never talks to D1 at all.
// Other network calls: /api/config and the optional Live AI analysis.
//
// Every mutation throws a readable Error when a rule is broken, so callers
// never report success for a change that did not happen.

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Where this workspace's AI summaries are safe right now: D1 (cloud and
 * browser), or this browser only (D1 unavailable, offline, or Demo Mode).
 */
export type SummaryStorage = "unknown" | "d1" | "local";

interface Store {
  user: User | null;
  ready: boolean;
  config: AppConfig;
  isManager: boolean;
  cases: CaseItem[];
  docs: DocItem[];
  extractions: Extraction[];
  recs: Recommendation[];
  audit: W.Workspace["audit"];
  summaries: W.DocSummaryItem[];
  /** Whether the AI summaries are also stored in D1, or only in this browser. */
  summaryStorage: SummaryStorage;
  /** Loads the D1 summaries for one case into the browser copy (best effort). */
  syncSummaries: (caseId: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, org: string) => Promise<void>;
  logout: () => Promise<void>;
  addCase: (c: W.NewCase) => Promise<CaseItem>;
  updateCase: (id: string, patch: Partial<CaseItem>) => Promise<CaseItem>;
  addDoc: (d: Omit<DocItem, "id" | "uploadedAt">) => Promise<DocItem>;
  addRec: (r: Recommendation) => Promise<Recommendation>;
  reviewRec: (id: string, patch: W.ReviewPatch) => Promise<Recommendation>;
  log: (caseId: string | null, action: string, details: string, category: string) => Promise<void>;
  importCases: (items: Partial<W.NewCase>[]) => Promise<{ added: number; skipped: number; invalid: number }>;
  resetDemo: () => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  extractFile: (file: File) => Promise<ExtractResponse>;
  analyze: (caseId: string) => Promise<AnalyzeResponse>;
  replaceCaseExtractions: (caseId: string, list: Extraction[]) => Promise<void>;
  toast: { msg: string; tone: "ok" | "warn" } | null;
  notify: (msg: string, tone?: "ok" | "warn") => void;
}

const WORKSPACE_KEY = "workspace";
const ACCOUNTS_KEY = "accounts";
const SESSION_KEY = "session";
const DEFAULT_CONFIG: AppConfig = { aiMode: "demo", model: null };
const EMPTY: W.Workspace = { version: W.WORKSPACE_VERSION, cases: [], docs: [], extractions: [], recs: [], audit: [] };
const STORAGE_BLOCKED = "This browser is blocking site storage, so changes work now but will be lost when you reload.";

const Ctx = createContext<Store | null>(null);

function signedIn(u: User | null): User {
  if (!u) throw new Error("Please sign in again.");
  return u;
}

function manager(u: User | null, what: string): User {
  const user = signedIn(u);
  if (!canManage(user.role)) throw new Error(`Only senior case workers and admins can ${what}.`);
  return user;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [ws, setWs] = useState<W.Workspace>(EMPTY);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);
  // Refs hold the latest values so several awaited mutations in one handler
  // (e.g. analysis: facts, recommendation, case status, audit) build on each other.
  const wsRef = useRef<W.Workspace>(EMPTY);
  // The D1 isolation token of the current workspace (see ./summaries.ts).
  const tokenRef = useRef<string | null>(null);
  const [summaryStorage, setSummaryStorage] = useState<SummaryStorage>("unknown");
  const userRef = useRef<User | null>(null);
  const accountsRef = useRef<LocalAccount[]>([]);
  const storageWarned = useRef(false);

  const notify = useCallback((msg: string, tone: "ok" | "warn" = "ok") => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const warnStorage = useCallback(() => {
    if (storageWarned.current) return;
    storageWarned.current = true;
    notify(STORAGE_BLOCKED, "warn");
  }, [notify]);

  // Applies a new workspace and saves it. IndexedDB runs transactions on one
  // store in the order they were created, so the latest state always wins.
  const apply = useCallback((next: W.Workspace) => {
    wsRef.current = next;
    setWs(next);
    void kvSet(WORKSPACE_KEY, next).then((ok) => { if (!ok) warnStorage(); });
  }, [warnStorage]);

  const setSignedIn = useCallback((u: User | null) => {
    userRef.current = u;
    setUser(u);
  }, []);

  // First load: the saved workspace (or the demo dataset), accounts and sign-in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored, accounts, session] = await Promise.all([
        kvGet<unknown>(WORKSPACE_KEY),
        kvGet<LocalAccount[]>(ACCOUNTS_KEY),
        kvGet<{ userId?: string }>(SESSION_KEY),
      ]);
      if (cancelled) return;
      const loaded = W.loadWorkspace(stored) ?? W.demoWorkspace();
      // Workspaces saved before D1 support get their isolation token here.
      const initial = W.ensureWorkspaceToken(loaded);
      tokenRef.current = initial.workspaceToken ?? null;
      wsRef.current = initial;
      setWs(initial);
      if (initial !== loaded) void kvSet(WORKSPACE_KEY, initial);
      accountsRef.current = Array.isArray(accounts) ? accounts : [];
      setSignedIn(findUser(accountsRef.current, session?.userId));
      setReady(true);
    })();
    fetch("/api/config")
      .then((r) => (r.ok ? (r.json() as Promise<Partial<AppConfig>>) : null))
      .then((cfg) => { if (!cancelled && cfg && (cfg.aiMode === "llm" || cfg.aiMode === "demo")) setConfig({ aiMode: cfg.aiMode, model: cfg.model ?? null }); })
      .catch(() => { /* offline: stay in Demo Mode */ });
    return () => { cancelled = true; };
  }, [setSignedIn]);

  // ---------- Accounts ----------

  const startSession = useCallback(async (u: User) => {
    if (!(await kvSet(SESSION_KEY, { userId: u.id }))) warnStorage();
    setSignedIn(u);
  }, [setSignedIn, warnStorage]);

  const freshAccounts = useCallback(async () => {
    const stored = await kvGet<LocalAccount[]>(ACCOUNTS_KEY);
    if (Array.isArray(stored)) accountsRef.current = stored; // another tab may have added one
    return accountsRef.current;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authenticate(await freshAccounts(), email, password);
    await startSession(u);
  }, [freshAccounts, startSession]);

  const signup = useCallback(async (name: string, email: string, password: string, org: string) => {
    const { accounts, user: u } = await createAccount(await freshAccounts(), { name, email, password, org }, W.newId());
    accountsRef.current = accounts;
    if (!(await kvSet(ACCOUNTS_KEY, accounts))) warnStorage();
    await startSession(u);
  }, [freshAccounts, startSession, warnStorage]);

  const logout = useCallback(async () => {
    await kvDelete(SESSION_KEY);
    setSignedIn(null);
  }, [setSignedIn]);

  // ---------- Workspace ----------

  const log = useCallback(async (caseId: string | null, action: string, details: string, category: string) => {
    try {
      apply(W.appendAudit(wsRef.current, caseId, action, details, category, userRef.current?.name || "System").ws);
    } catch (e) {
      notify(`Audit entry "${action}" could not be saved: ${errorMessage(e)}`, "warn");
    }
  }, [apply, notify]);

  const addCase = useCallback(async (c: W.NewCase) => {
    const r = W.createCase(wsRef.current, c, signedIn(userRef.current).name);
    apply(r.ws);
    return r.item;
  }, [apply]);

  const updateCase = useCallback(async (id: string, patch: Partial<CaseItem>) => {
    const r = W.updateCase(wsRef.current, id, patch);
    apply(r.ws);
    return r.item;
  }, [apply]);

  const addDoc = useCallback(async (d: Omit<DocItem, "id" | "uploadedAt">) => {
    const r = W.addDocument(wsRef.current, d);
    apply(r.ws);
    return r.item;
  }, [apply]);

  const replaceCaseExtractions = useCallback(async (caseId: string, list: Extraction[]) => {
    apply(W.replaceExtractions(wsRef.current, caseId, list));
  }, [apply]);

  const addRec = useCallback(async (rec: Recommendation) => {
    const r = W.addRecommendation(wsRef.current, rec);
    apply(r.ws);
    return r.item;
  }, [apply]);

  const reviewRec = useCallback(async (id: string, patch: W.ReviewPatch) => {
    const r = W.reviewRecommendation(wsRef.current, id, patch, signedIn(userRef.current).name);
    apply(r.ws);
    return r.item;
  }, [apply]);

  const importCases = useCallback(async (items: Partial<W.NewCase>[]) => {
    const r = W.importCases(wsRef.current, items);
    apply(r.ws);
    return { added: r.added, skipped: r.skipped, invalid: r.invalid };
  }, [apply]);

  const resetDemo = useCallback(async () => {
    const u = manager(userRef.current, "reset demo data");
    // A reset is a clean slate, so it also gets a fresh D1 token; the old
    // workspace's cloud summaries are removed when D1 is reachable.
    const previousToken = tokenRef.current;
    const next = W.ensureWorkspaceToken(
      W.appendAudit(W.demoWorkspace(), null, "Demo data reset", "Workspace reset to the fictional demo data", "system", u.name).ws
    );
    tokenRef.current = next.workspaceToken ?? null;
    apply(next);
    setSummaryStorage("unknown");
    if (previousToken) void deleteStoredSummaries({ token: previousToken });
  }, [apply]);

  const deleteCase = useCallback(async (id: string) => {
    const u = manager(userRef.current, "delete cases");
    apply(W.deleteCase(wsRef.current, id, u.name));
    // Best effort: deleting a case should not leave its AI summaries in D1.
    if (tokenRef.current) void deleteStoredSummaries({ token: tokenRef.current, caseId: id });
  }, [apply]);

  // Text extraction runs in the browser; the parsers load on first use.
  // The SSR guard lets the Cloudflare (Vite) server build drop PDF.js and
  // mammoth entirely — the Worker never parses files.
  const extractFile = useCallback(async (file: File): Promise<ExtractResponse> => {
    if (import.meta.env?.SSR) throw new Error("Text extraction runs in the browser.");
    const { extractFile: extract } = await import("./extract");
    return extract(file);
  }, []);

  // ---------- AI summaries in D1 ----------

  /**
   * Loads the cloud copy of a case's AI summaries into the workspace. Run when
   * a case page opens. Any failure (no D1 binding, offline, an error status)
   * leaves the browser copy untouched and marks the summaries local-only.
   */
  const syncSummaries = useCallback(async (caseId: string) => {
    const token = tokenRef.current;
    if (!token || !caseId) {
      setSummaryStorage("local");
      return;
    }
    // Demo Mode produces no summaries, so it never depends on D1.
    const result = await syncCaseSummaries({ caseId, token, aiMode: config.aiMode });
    if (!result) {
      setSummaryStorage("local");
      return;
    }
    // A reset or sign-in change may have replaced the workspace meanwhile.
    if (tokenRef.current !== token) return;
    if (!result.ok) {
      setSummaryStorage("local");
      return;
    }
    setSummaryStorage("d1");
    if (result.summaries.length) apply(W.mergeSummaries(wsRef.current, caseId, result.summaries));
  }, [apply, config.aiMode]);

  /** Mirrors the workspace's summaries for one case to D1. Never throws. */
  const persistCaseSummaries = useCallback(async (caseId: string, token: string) => {
    const summaries = W.caseSummaries(wsRef.current, caseId).map((s) => ({
      documentId: s.documentId,
      documentName: s.documentName,
      summary: s.summary,
      highlights: s.highlights,
      engine: s.engine,
    }));
    if (!summaries.length) return;
    const result = await saveCaseSummaries({ caseId, token, summaries });
    if (tokenRef.current === token) setSummaryStorage(result.ok ? "d1" : "local");
  }, []);

  // Live AI runs on the server (it holds the API key). Without a key the app
  // is in Demo Mode and the caller runs the local demo engine instead.
  const analyze = useCallback(async (caseId: string): Promise<AnalyzeResponse> => {
    if (config.aiMode !== "llm") return { mode: "demo", reason: "No LLM_API_KEY configured — using the local demo engine." };
    const c = wsRef.current.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    // Send documents in upload order, trimmed to what the prompt can hold.
    let budget = MAX_PROMPT_CHARS;
    const documents = wsRef.current.docs.filter((d) => d.caseId === caseId).reverse().map((d) => {
      const extractedText = (d.extractedText || "").slice(0, Math.max(0, budget));
      budget -= extractedText.length;
      return { id: d.id, name: d.name, extractedText };
    });
    let res: Response;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case: { title: c.title, clientName: c.clientName, caseType: c.caseType }, documents }),
      });
    } catch {
      throw new ApiError("Network error — check your connection and try again.", 0);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(data.error || `Request failed (HTTP ${res.status})`, res.status);
    const out = data as unknown as { mode?: string; result?: { documentSummaries?: unknown[] } };
    if (out.mode === "llm" && out.result?.documentSummaries?.length) {
      // Always kept in this browser first, then mirrored to D1. If D1 is
      // unavailable the summary stays local and the UI says so.
      apply(W.replaceSummaries(wsRef.current, caseId, out.result.documentSummaries, "llm"));
      const token = tokenRef.current;
      if (token) await persistCaseSummaries(caseId, token);
    }
    return data as unknown as AnalyzeResponse;
  }, [apply, config.aiMode, persistCaseSummaries]);

  const value: Store = {
    user, ready, config, isManager: canManage(user?.role),
    cases: ws.cases, docs: ws.docs, extractions: ws.extractions, recs: ws.recs, audit: ws.audit, summaries: ws.summaries ?? [],
    summaryStorage, syncSummaries,
    login, signup, logout, addCase, updateCase, addDoc, addRec, reviewRec,
    log, importCases, resetDemo, deleteCase, extractFile, analyze, replaceCaseExtractions, toast, notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
