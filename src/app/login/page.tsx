"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles, ArrowLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { Logo, DemoBanner } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useStore();
  const [email, setEmail] = useState("demo@caseclarity.ai");
  const [password, setPassword] = useState("demo1234");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) router.push("/dashboard");
    else setError("Invalid email or password. Try the demo account below, or create a new account.");
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
          <div className="mt-5"><DemoBanner /></div>
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
          <button onClick={() => { setEmail("demo@caseclarity.ai"); setPassword("demo1234"); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800 hover:bg-blue-100">
            <Sparkles size={14} /> Use demo account for judges — demo@caseclarity.ai / demo1234
          </button>
          <p className="mt-5 text-center text-sm text-slate-500">No account? <Link href="/signup" className="font-bold text-[#2563eb] hover:underline">Create one</Link></p>
        </div>
      </div>
    </div>
  );
}
