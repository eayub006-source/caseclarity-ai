"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowLeft } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/data/demo-data";
import { ROLE_LABELS } from "@/lib/roles";
import { Logo, AiModeBanner, AuthAside } from "@/components/ui";

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
      <AuthAside title="Understand every AI decision. Trust every case." lines={["Every recommendation cites its source documents", "People approve — the AI never decides alone", "A full audit history for every case"]} />
      <div className="flex items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md animate-fadeUp">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"><ArrowLeft size={13} /> Back to home</Link>
          <div className="lg:hidden"><Logo /></div>
          <h1 className="mt-4 text-3xl font-medium text-fg">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your case worker workspace.</p>
          <div className="mt-5"><AiModeBanner /></div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Email</span>
              <div className="relative"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="you@organization.org" /></div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Password</span>
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={password} onChange={e => setPassword(e.target.value)} type={show ? "text" : "password"} required className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-11 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="••••••••" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg-2">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </label>
            {error && <div className="rounded-xl border border-accent bg-ember-100/10 px-3 py-2 text-xs font-semibold text-ember-100">{error}</div>}
            <button disabled={loading} className="w-full rounded-full bg-accent py-3 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="mt-3 rounded-xl border border-dashed border-ember-40 bg-ember-10 p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-fg-2"><Sparkles size={13} /> <span className="">One-click demo accounts</span> · password <code className="rounded bg-panel px-1 font-mono">{DEMO_PASSWORD}</code></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.id} type="button" disabled={loading} onClick={() => signIn(a.email, DEMO_PASSWORD)} className="min-w-0 rounded-lg border border-ember-30 bg-panel px-3 py-2 text-left hover:border-accent disabled:opacity-60">
                  <span className="block truncate text-xs font-semibold text-fg">{a.name}</span>
                  <span className="block truncate text-[11px] font-semibold text-accent">{ROLE_LABELS[a.role]}</span>
                  <span className="block truncate text-[11px] text-muted">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Demo build: accounts and case data are fictional and saved only in this browser.</p>
          <p className="mt-5 text-center text-sm text-muted">No account? <Link href="/signup" className="font-medium text-accent hover:underline">Create one</Link></p>
        </div>
      </div>
    </div>
  );
}
