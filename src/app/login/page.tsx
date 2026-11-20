"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles, ArrowLeft } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/data/demo-data";
import { ROLE_LABELS } from "@/lib/roles";
import { Logo, AiModeBanner } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useStore();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (em: string, pw: string) => {
    setError(""); setLoading(true);
    try {
      await login(em, pw);
      router.push("/dashboard");
    } catch (err) {
      setLoading(false);
      setError(errorMessage(err, "Sign-in failed. Please try again."));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void signIn(email, password);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#0f2043] p-10 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight">Understand Every AI Decision.<br />Trust Every Case.</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">Evidence-backed recommendations, confidence indicators and a complete audit trail — built for legal-aid case workers.</p>
          <div className="mt-8 space-y-3 text-sm text-slate-300">
            {["Every recommendation cites its source documents", "Humans approve — AI never decides alone", "Full audit history for every case"].map(t => (
              <div key={t} className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-emerald-400" />{t}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400">© 2026 CaseClarity AI · Team HACKSMITHS · Fictional demo data</p>
      </div>
      <div className="flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md animate-fadeUp">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#0f2043]"><ArrowLeft size={13} /> Back to home</Link>
          <div className="lg:hidden"><Logo /></div>
          <h1 className="mt-4 text-2xl font-extrabold text-[#0f2043]">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your case worker workspace.</p>
          <div className="mt-5"><AiModeBanner /></div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
              <div className="relative"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="you@organization.org" /></div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</span>
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={password} onChange={e => setPassword(e.target.value)} type={show ? "text" : "password"} required className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-11 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="••••••••" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </label>
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
            <button disabled={loading} className="w-full rounded-xl bg-[#0f2043] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#1e3a5f] disabled:opacity-60">{loading ? "Signing in…" : "Sign In"}</button>
          </form>
          <div className="mt-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-blue-800"><Sparkles size={13} /> <span className="uppercase tracking-wide">One-click demo accounts</span> · password <code className="rounded bg-white px-1 font-mono">{DEMO_PASSWORD}</code></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.id} type="button" disabled={loading} onClick={() => signIn(a.email, DEMO_PASSWORD)} className="min-w-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left hover:border-blue-400 disabled:opacity-60">
                  <span className="block truncate text-xs font-extrabold text-[#0f2043]">{a.name}</span>
                  <span className="block truncate text-[11px] font-semibold text-blue-700">{ROLE_LABELS[a.role]}</span>
                  <span className="block truncate text-[11px] text-slate-500">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Demo build: accounts and case data are fictional and saved only in this browser.</p>
          <p className="mt-5 text-center text-sm text-slate-500">No account? <Link href="/signup" className="font-bold text-[#2563eb] hover:underline">Create one</Link></p>
        </div>
      </div>
    </div>
  );
}
