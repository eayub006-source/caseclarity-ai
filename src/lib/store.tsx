"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { CaseItem, DocItem, Extraction, Recommendation, AuditEntry, User } from "./core";

// PostgreSQL-backed store. All data is loaded from and written to the
// Next.js API routes (which query PostgreSQL via Drizzle). Authentication
// uses server-side sessions (httpOnly cookie) — no credentials or passwords
// are stored in localStorage.

interface Store {
  user: User | null;
  ready: boolean;
  cases: CaseItem[];
  docs: DocItem[];
  extractions: Extraction[];
  recs: Recommendation[];
  audit: AuditEntry[];
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  addCase: (c: Omit<CaseItem, "id" | "caseNumber" | "createdAt" | "updatedAt" | "completeness">) => Promise<CaseItem>;
  updateCase: (id: string, patch: Partial<CaseItem>) => Promise<void>;
  addDoc: (d: DocItem) => Promise<void>;
  addExtractions: (e: Extraction[]) => Promise<void>;
  addRec: (r: Recommendation) => Promise<void>;
  updateRec: (id: string, patch: Partial<Recommendation>) => Promise<void>;
  log: (caseId: string | null, action: string, details: string, category: string) => void;
  importCases: (items: CaseItem[]) => Promise<{ added: number; skipped: number }>;
  resetDemo: () => Promise<void>;
  replaceCaseExtractions: (caseId: string, list: Extraction[]) => Promise<void>;
  toast: { msg: string; tone: "ok" | "warn" } | null;
  notify: (msg: string, tone?: "ok" | "warn") => void;
}

const Ctx = createContext<Store | null>(null);

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "same-origin",
  });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);
  const casesRef = useRef<CaseItem[]>([]);
  useEffect(() => { casesRef.current = cases; }, [cases]);

  const notify = useCallback((msg: string, tone: "ok" | "warn" = "ok") => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadAll = useCallback(async (): Promise<boolean> => {
    const [cRes, dRes, eRes, rRes, aRes] = await Promise.all([
      api("/api/cases"), api("/api/documents"), api("/api/extractions"), api("/api/recommendations"), api("/api/audit"),
    ]);
    if (cRes.status === 401) { setUser(null); return false; }
    const [c, d, e, r, a] = await Promise.all([cRes.json(), dRes.json(), eRes.json(), rRes.json(), aRes.json()]);
    setCases(c.cases || []); setDocs(d.documents || []); setExtractions(e.extractions || []);
    setRecs(r.recommendations || []); setAudit(a.audit || []);
    return true;
  }, []);

  const ensureSeed = useCallback(async () => {
    try {
      const res = await api("/api/cases");
      const data = await res.json();
      if ((data.cases || []).length === 0) {
        await api("/api/seed", { method: "POST" });
      }
    } catch {}
  }, []);

  // Restore session on first load.
  useEffect(() => {
    (async () => {
      try {
        const me = await api("/api/auth").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (me?.user) {
          setUser(me.user);
          await ensureSeed();
          await loadAll();
        }
      } catch {}
      setReady(true);
    })();
  }, [ensureSeed, loadAll]);

  const log = useCallback((caseId: string | null, action: string, details: string, category: string) => {
    const entry: AuditEntry = { id: "tmp-" + Math.random().toString(36).slice(2, 9), caseId, actor: user?.name || "System", action, details, category, timestamp: new Date().toISOString() };
    setAudit((prev) => [entry, ...prev]);
    api("/api/audit", { method: "POST", body: JSON.stringify({ caseId, action, details, category }) }).catch(() => {});
  }, [user]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const res = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password }) });
    if (!res.ok) return false;
    const data = await res.json();
    setUser(data.user);
    await ensureSeed();
    await loadAll();
    return true;
  }, [ensureSeed, loadAll]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const res = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signup", name, email, password }) });
    if (!res.ok) throw new Error("Signup failed");
    const data = await res.json();
    setUser(data.user);
    await ensureSeed();
    await loadAll();
  }, [ensureSeed, loadAll]);

  const logout = useCallback(async () => {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) }).catch(() => {});
    setUser(null);
    setCases([]); setDocs([]); setExtractions([]); setRecs([]); setAudit([]);
  }, []);

  const addCase = useCallback(async (c: Omit<CaseItem, "id" | "caseNumber" | "createdAt" | "updatedAt" | "completeness">): Promise<CaseItem> => {
    const res = await api("/api/cases", { method: "POST", body: JSON.stringify(c) });
    const data = await res.json();
    const item = data.case as CaseItem;
    setCases((prev) => [item, ...prev]);
    return item;
  }, []);

  const updateCase = useCallback(async (id: string, patch: Partial<CaseItem>) => {
    const res = await api(`/api/cases/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) {
      const data = await res.json();
      setCases((prev) => prev.map((c) => (c.id === id ? data.case : c)));
    }
  }, []);

  const addDoc = useCallback(async (d: DocItem) => {
    const res = await api("/api/documents", { method: "POST", body: JSON.stringify(d) });
    if (res.ok) {
      const data = await res.json();
      setDocs((prev) => [data.document, ...prev]);
    }
  }, []);

  const addExtractions = useCallback(async (e: Extraction[]) => {
    if (!e.length) return;
    const res = await api("/api/extractions", { method: "POST", body: JSON.stringify({ items: e }) });
    if (res.ok) {
      const data = await res.json();
      setExtractions((prev) => [...(data.extractions || []), ...prev]);
    }
  }, []);

  const replaceCaseExtractions = useCallback(async (caseId: string, list: Extraction[]) => {
    await api(`/api/extractions?caseId=${encodeURIComponent(caseId)}`, { method: "DELETE" });
    setExtractions((prev) => prev.filter((e) => e.caseId !== caseId));
    if (list.length) {
      const res = await api("/api/extractions", { method: "POST", body: JSON.stringify({ items: list }) });
      if (res.ok) {
        const data = await res.json();
        setExtractions((prev) => [...(data.extractions || []), ...prev]);
      }
    }
  }, []);

  const addRec = useCallback(async (r: Recommendation) => {
    const res = await api("/api/recommendations", { method: "POST", body: JSON.stringify(r) });
    if (res.ok) {
      const data = await res.json();
      setRecs((prev) => [data.recommendation, ...prev]);
    }
  }, []);

  const updateRec = useCallback(async (id: string, patch: Partial<Recommendation>) => {
    const res = await api(`/api/recommendations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) {
      const data = await res.json();
      setRecs((prev) => prev.map((r) => (r.id === id ? data.recommendation : r)));
    }
  }, []);

  const importCases = useCallback(async (items: CaseItem[]): Promise<{ added: number; skipped: number }> => {
    const res = await api("/api/cases", { method: "POST", body: JSON.stringify({ items }) });
    const data = await res.json();
    if (data.cases?.length) setCases((prev) => [...data.cases, ...prev]);
    return { added: data.added || 0, skipped: data.skipped || 0 };
  }, []);

  const resetDemo = useCallback(async () => {
    await api("/api/seed?reset=1", { method: "POST" });
    await loadAll();
  }, [loadAll]);

  const value: Store = {
    user, ready, cases, docs, extractions, recs, audit,
    login, signup, logout, addCase, updateCase, addDoc, addExtractions, addRec, updateRec,
    log, importCases, resetDemo, replaceCaseExtractions, toast, notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
