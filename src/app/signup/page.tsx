"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, Building2 } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { Logo } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Must match MIN_PASSWORD_LENGTH in src/lib/password.ts (enforced again in src/lib/accounts.ts).
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError(""); setLoading(true);
    try {
      await signup(name, email, password, org);
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Could not create account."));
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#0f2043] p-10 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight">Start trusting your AI-assisted workflow.</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">Create a workspace for your legal-aid team. Upload documents, get explainable recommendations, and keep a complete audit trail.</p>
          <div className="mt-8 space-y-3 text-sm text-slate-300">
            {["Free for legal-aid nonprofits (demo)", "No real client data needed — fictional demo included", "Human review required for every recommendation"].map(t => (
              <div key={t} className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-emerald-400" />{t}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400">© 2026 CaseClarity AI · Team HACKSMITHS</p>
      </div>
      <div className="flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md animate-fadeUp">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#0f2043]"><ArrowLeft size={13} /> Back to home</Link>
          <div className="lg:hidden"><Logo /></div>
          <h1 className="mt-4 text-2xl font-extrabold text-[#0f2043]">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Set up your case worker workspace in seconds.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Full name</span>
              <div className="relative"><User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Alex Rivera" /></div></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Work email</span>
              <div className="relative"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="you@legalaid.org" /></div></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</span>
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={password} onChange={e => setPassword(e.target.value)} type={show ? "text" : "password"} required className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-11 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Min. 6 characters" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Organization (optional)</span>
              <div className="relative"><Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={org} onChange={e => setOrg(e.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Northside Legal Aid" /></div></label>
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
            <button disabled={loading} className="w-full rounded-xl bg-[#0f2043] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#1e3a5f] disabled:opacity-60">{loading ? "Creating account…" : "Create Account"}</button>
            <p className="text-center text-[11px] leading-relaxed text-slate-400">By creating an account you agree this is a hackathon demo using fictional data. Do not upload real client documents.</p>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="font-bold text-[#2563eb] hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
