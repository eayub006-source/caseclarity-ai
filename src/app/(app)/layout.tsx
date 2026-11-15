"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderOpen, UploadCloud, Plug, BarChart3, History, LogOut, Menu, X, Plus, Search, Bell, ShieldCheck, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { Logo, Badge } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases", label: "Cases", icon: FolderOpen },
  { href: "/upload", label: "Upload Documents", icon: UploadCloud },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/evaluation", label: "Evaluation", icon: BarChart3 },
  { href: "/audit", label: "Audit Trail", icon: History },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, resetDemo, log, toast, ready } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Wait for the server-side session check before deciding access.
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-400">Loading workspace…</div>;
  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f8fb] px-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg animate-fadeUp">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#0f2043] text-white"><ShieldCheck size={22} /></div>
          <h1 className="mt-4 text-lg font-extrabold text-[#0f2043]">Sign in required</h1>
          <p className="mt-1 text-sm text-slate-500">Please sign in to access the CaseClarity AI workspace.</p>
          <Link href="/login" className="mt-5 block rounded-xl bg-[#0f2043] py-3 text-sm font-bold text-white">Go to Sign In</Link>
          <Link href="/" className="mt-2 block rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-600">Back to Home</Link>
        </div>
      </div>
    );
  }

  const initials = user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-5 py-4"><Logo /></div>
      <div className="px-4 pt-4">
        <Link href="/cases/new" onClick={() => setOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f2043] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#1e3a5f]"><Plus size={16} /> New Case</Link>
      </div>
      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin">
        {NAV.map(n => {
          const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
          return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? "bg-[#0f2043] text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}>
              <n.icon size={17} />{n.label}
              {n.href === "/cases" && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>6</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
          <b>Demo Mode</b> — fictional data. AI assists; humans decide.
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] text-xs font-extrabold text-white">{initials}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-extrabold text-slate-800">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user.role}</div>
          </div>
          <button onClick={() => { logout(); router.push("/login"); }} title="Sign out" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut size={16} /></button>
        </div>
        <button onClick={() => { resetDemo(); log(null, "Demo data reset", "Workspace reset to fictional seed data", "system"); }} className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-100"><RotateCcw size={12} /> Reset demo data</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      {/* Mobile topbar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Bell size={18} /></button>
          <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>{sidebar}</aside>
      <div className="lg:pl-64">
        <div className="sticky top-0 z-30 hidden items-center justify-between border-b border-slate-200 bg-white/85 px-6 py-3 backdrop-blur lg:flex">
          <div>
            <div className="text-sm font-extrabold text-[#0f2043]">{NAV.find(n => pathname.startsWith(n.href))?.label || "Workspace"}</div>
            <div className="text-[11px] text-slate-400">{user.org} · {user.email}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Search cases… (use Cases page)" className="w-56 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-400" onKeyDown={e => { if (e.key === "Enter") router.push("/cases"); }} />
            </div>
            <Badge tone="amber">Demo Mode</Badge>
            <button className="relative rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Bell size={16} /><span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-extrabold text-white">3</span></button>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
        {toast && (
          <div role="status" className={`fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl animate-fadeUp ${toast.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-white text-slate-800"}`}>
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toast.tone === "warn" ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
