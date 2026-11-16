"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { CaseItem, DocItem, Extraction, Recommendation, AuditEntry, User, AppConfig } from "./core";
import { canManage } from "./roles";
import type { VerifiedResult } from "./llm";

export interface ExtractResponse { name: string; text: string; pageCount: number; type: string; pagesEstimated: boolean; warning?: string; }
export type AnalyzeResponse = { mode: "llm"; model: string; result: VerifiedResult } | { mode: "demo"; reason: string };

// PostgreSQL-backed store. All data is loaded from and written to the
// Next.js API routes (which query PostgreSQL via Drizzle). Authentication
// uses server-side sessions (httpOnly cookie) — no credentials or passwords
// are stored in localStorage.
//
// Every mutation checks the server's answer. On failure it throws an Error
// with a readable message, so callers never report success for a write that
// did not happen. A 401 on any data call means the session expired: the user
// is signed out locally and the workspace shows "Sign in required".

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

type NewCase = Omit<CaseItem, "id" | "caseNumber" | "createdAt" | "updatedAt" | "completeness">;
type ReviewPatch = { status: "approved" | "rejected" | "modified"; reviewComment?: string; summary?: string };

interface Store {
  user: User | null;
  ready: boolean;
  config: AppConfig;
  isManager: boolean;
  cases: CaseItem[];
  docs: DocItem[];
  extractions: Extraction[];
  recs: Recommendation[];
  audit: AuditEntry[];
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, org: string) => Promise<void>;
  logout: () => Promise<void>;
  addCase: (c: NewCase) => Promise<CaseItem>;
  updateCase: (id: string, patch: Partial<CaseItem>) => Promise<CaseItem>;
  addDoc: (d: Omit<DocItem, "id" | "uploadedAt">) => Promise<DocItem>;
  addRec: (r: Recommendation) => Promise<Recommendation>;
  reviewRec: (id: string, patch: ReviewPatch) => Promise<Recommendation>;
  log: (caseId: string | null, action: string, details: string, category: string) => Promise<void>;
  importCases: (items: CaseItem[]) => Promise<{ added: number; skipped: number; invalid: number }>;
  resetDemo: () => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  extractFile: (file: File) => Promise<ExtractResponse>;
  analyze: (caseId: string) => Promise<AnalyzeResponse>;
  replaceCaseExtractions: (caseId: string, list: Extraction[]) => Promise<void>;
  toast: { msg: string; tone: "ok" | "warn" } | null;
  notify: (msg: string, tone?: "ok" | "warn") => void;
}

const DEFAULT_CONFIG: AppConfig = { aiMode: "demo", model: null, demoAccount: false };
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const notify = useCallback((msg: string, tone: "ok" | "warn" = "ok") => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const clearData = useCallback(() => {
    setCases([]); setDocs([]); setExtractions([]); setRecs([]); setAudit([]);
  }, []);

  // JSON request that throws ApiError on any non-2xx answer.
  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(path, {
        ...init,
        // FormData sets its own multipart Content-Type.
        headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers || {}) },
        credentials: "same-origin",
      });
    } catch {
      throw new ApiError("Network error — check your connection and try again.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/api/auth") && userRef.current) {
      setUser(null);
      clearData();
      notify("Your session has expired. Please sign in again.", "warn");
    }
    if (!res.ok) throw new ApiError(data?.error || `Request failed (HTTP ${res.status})`, res.status);
    return data as T;
  }, [clearData, notify]);

  const loadAll = useCallback(async () => {
    const [c, d, e, r, a] = await Promise.all([
      request<{ cases: CaseItem[] }>("/api/cases"),
      request<{ documents: DocItem[] }>("/api/documents"),
      request<{ extractions: Extraction[] }>("/api/extractions"),
      request<{ recommendations: Recommendation[] }>("/api/recommendations"),
      request<{ audit: AuditEntry[] }>("/api/audit"),
    ]);
    setCases(c.cases || []); setDocs(d.documents || []); setExtractions(e.extractions || []);
    setRecs(r.recommendations || []); setAudit(a.audit || []);
  }, [request]);

  // First run with demo mode on: load the fictional dataset.
  const ensureSeed = useCallback(async (cfg: AppConfig) => {
    if (!cfg.demoAccount) return;
    try { await request("/api/seed", { method: "POST" }); } catch { /* already seeded or not allowed */ }
  }, [request]);

  const loadConfig = useCallback(async (): Promise<AppConfig> => {
    try {
      const cfg = await request<AppConfig>("/api/config");
      setConfig(cfg);
      return cfg;
    } catch {
      return DEFAULT_CONFIG;
    }
  }, [request]);

  const startSession = useCallback(async (u: User, cfg: AppConfig) => {
    setUser(u);
    userRef.current = u;
    await ensureSeed(cfg);
    await loadAll();
  }, [ensureSeed, loadAll]);

  // Restore session on first load.
  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      try {
        const me = await request<{ user: User }>("/api/auth");
        if (me.user) await startSession(me.user, cfg);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) notify(`Could not load the workspace: ${errorMessage(e)}`, "warn");
      }
      setReady(true);
    })();
  }, [loadConfig, request, startSession, notify]);

  const log = useCallback(async (caseId: string | null, action: string, details: string, category: string) => {
    const tmpId = "tmp-" + Math.random().toString(36).slice(2, 9);
    const entry: AuditEntry = { id: tmpId, caseId, actor: userRef.current?.name || "System", action, details, category, timestamp: new Date().toISOString() };
    setAudit((prev) => [entry, ...prev]);
    try {
      const data = await request<{ entry: AuditEntry }>("/api/audit", { method: "POST", body: JSON.stringify({ caseId, action, details, category }) });
      setAudit((prev) => prev.map((a) => (a.id === tmpId ? data.entry : a)));
    } catch (e) {
      setAudit((prev) => prev.filter((a) => a.id !== tmpId));
      notify(`Audit entry "${action}" could not be saved: ${errorMessage(e)}`, "warn");
    }
  }, [request, notify]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await request<{ user: User }>("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password }) });
    await startSession(data.user, config);
  }, [request, startSession, config]);

  const signup = useCallback(async (name: string, email: string, password: string, org: string) => {
    const data = await request<{ user: User }>("/api/auth", { method: "POST", body: JSON.stringify({ action: "signup", name, email, password, org }) });
    await startSession(data.user, config);
  }, [request, startSession, config]);

  const logout = useCallback(async () => {
    await request("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) }).catch(() => {});
    setUser(null);
    userRef.current = null;
    clearData();
  }, [request, clearData]);

  const addCase = useCallback(async (c: NewCase) => {
    const data = await request<{ case: CaseItem }>("/api/cases", { method: "POST", body: JSON.stringify(c) });
    setCases((prev) => [data.case, ...prev]);
    return data.case;
  }, [request]);

  const updateCase = useCallback(async (id: string, patch: Partial<CaseItem>) => {
    const data = await request<{ case: CaseItem }>(`/api/cases/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setCases((prev) => prev.map((c) => (c.id === id ? data.case : c)));
    return data.case;
  }, [request]);

  const addDoc = useCallback(async (d: Omit<DocItem, "id" | "uploadedAt">) => {
    const data = await request<{ document: DocItem }>("/api/documents", { method: "POST", body: JSON.stringify(d) });
    setDocs((prev) => [data.document, ...prev]);
    return data.document;
  }, [request]);

  const replaceCaseExtractions = useCallback(async (caseId: string, list: Extraction[]) => {
    await request(`/api/extractions?caseId=${encodeURIComponent(caseId)}`, { method: "DELETE" });
    setExtractions((prev) => prev.filter((e) => e.caseId !== caseId));
    if (list.length) {
      const data = await request<{ extractions: Extraction[] }>("/api/extractions", { method: "POST", body: JSON.stringify({ items: list }) });
      setExtractions((prev) => [...prev, ...(data.extractions || [])]);
    }
  }, [request]);

  const addRec = useCallback(async (r: Recommendation) => {
    const data = await request<{ recommendation: Recommendation }>("/api/recommendations", { method: "POST", body: JSON.stringify(r) });
    setRecs((prev) => [data.recommendation, ...prev]);
    return data.recommendation;
  }, [request]);

  const reviewRec = useCallback(async (id: string, patch: ReviewPatch) => {
    const data = await request<{ recommendation: Recommendation }>(`/api/recommendations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setRecs((prev) => prev.map((r) => (r.id === id ? data.recommendation : r)));
    return data.recommendation;
  }, [request]);

  const importCases = useCallback(async (items: CaseItem[]) => {
    const data = await request<{ added: number; skipped: number; invalid: number; cases: CaseItem[] }>("/api/cases", { method: "POST", body: JSON.stringify({ items }) });
    if (data.cases?.length) setCases((prev) => [...[...data.cases].reverse(), ...prev]);
    return { added: data.added || 0, skipped: data.skipped || 0, invalid: data.invalid || 0 };
  }, [request]);

  const resetDemo = useCallback(async () => {
    await request("/api/seed?reset=1", { method: "POST" });
    await loadAll();
  }, [request, loadAll]);

  const deleteCase = useCallback(async (id: string) => {
    await request(`/api/cases/${id}`, { method: "DELETE" });
    setCases((prev) => prev.filter((c) => c.id !== id));
    setDocs((prev) => prev.filter((d) => d.caseId !== id));
    setExtractions((prev) => prev.filter((e) => e.caseId !== id));
    setRecs((prev) => prev.filter((r) => r.caseId !== id));
    // The server keeps the audit history and adds a "Case deleted" entry.
    const a = await request<{ audit: AuditEntry[] }>("/api/audit").catch(() => null);
    if (a) setAudit(a.audit);
  }, [request]);

  const extractFile = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ExtractResponse>("/api/extract", { method: "POST", body: fd });
  }, [request]);

  const analyze = useCallback(async (caseId: string) => {
    return request<AnalyzeResponse>("/api/analyze", { method: "POST", body: JSON.stringify({ caseId }) });
  }, [request]);

  const value: Store = {
    user, ready, config, isManager: canManage(user?.role), cases, docs, extractions, recs, audit,
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
