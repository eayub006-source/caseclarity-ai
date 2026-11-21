"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { CaseItem, DocItem, Extraction, Recommendation, User, AppConfig } from "./core";
import { canManage } from "./roles";
import type { VerifiedResult } from "./llm";
import { MAX_PROMPT_CHARS } from "./llm";
import { kvDelete, kvGet, kvSet } from "./browser-db";
import { authenticate, createAccount, findUser, type LocalAccount } from "./accounts";
import * as W from "./workspace";

export interface ExtractResponse { name: string; text: string; pageCount: number; type: string; pagesEstimated: boolean; warning?: string; }
export type AnalyzeResponse = { mode: "llm"; model: string; result: VerifiedResult } | { mode: "demo"; reason: string };

// The app's single data gateway. There is no database: the workspace starts
// as a copy of the fictional dataset in src/data/demo-data.ts and every
// change is saved in this browser (IndexedDB, see ./browser-db.ts). Each
// visitor therefore has a private copy, and "Reset demo data" restores it.
// The rules (validation, case numbers, locked reviews, append-only audit)
// live in ./workspace.ts. The only network calls are /api/config and the
// optional Live AI analysis (/api/analyze).
//
// Every mutation throws a readable Error when a rule is broken, so callers
// never report success for a change that did not happen.

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

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
      const initial = W.loadWorkspace(stored) ?? W.demoWorkspace();
      wsRef.current = initial;
      setWs(initial);
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
    apply(W.appendAudit(W.demoWorkspace(), null, "Demo data reset", "Workspace reset to the fictional demo data", "system", u.name).ws);
  }, [apply]);

  const deleteCase = useCallback(async (id: string) => {
    const u = manager(userRef.current, "delete cases");
    apply(W.deleteCase(wsRef.current, id, u.name));
  }, [apply]);

  // Text extraction runs in the browser; the parsers load on first use.
  // The SSR guard lets the Cloudflare (Vite) server build drop PDF.js and
  // mammoth entirely — the Worker never parses files.
  const extractFile = useCallback(async (file: File): Promise<ExtractResponse> => {
    if (import.meta.env?.SSR) throw new Error("Text extraction runs in the browser.");
    const { extractFile: extract } = await import("./extract");
    return extract(file);
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
      // Fire-and-forget: saved to D1 when a database is available, ignored otherwise.
      void fetch("/api/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, summaries: out.result.documentSummaries }),
      }).catch(() => {});
    }
    return data as unknown as AnalyzeResponse;
  }, [config.aiMode]);

  const value: Store = {
    user, ready, config, isManager: canManage(user?.role),
    cases: ws.cases, docs: ws.docs, extractions: ws.extractions, recs: ws.recs, audit: ws.audit,
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
