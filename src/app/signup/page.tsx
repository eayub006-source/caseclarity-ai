"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, ArrowLeft, Building2 } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { Logo, AuthAside } from "@/components/ui";

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
      <AuthAside title="Set up a workspace for your legal-aid team." lines={["Fictional demo cases are included — no real client data needed", "Every recommendation needs a person to approve it", "Your account and data stay in this browser"]} />
      <div className="flex items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md animate-fadeUp">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"><ArrowLeft size={13} /> Back to home</Link>
          <div className="lg:hidden"><Logo /></div>
          <h1 className="mt-4 text-3xl font-medium text-fg">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Set up your case worker workspace in seconds.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Full name</span>
              <div className="relative"><User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="Alex Rivera" /></div></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Work email</span>
              <div className="relative"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="you@legalaid.org" /></div></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Password</span>
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={password} onChange={e => setPassword(e.target.value)} type={show ? "text" : "password"} required className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-11 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg-2">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Organization (optional)</span>
              <div className="relative"><Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={org} onChange={e => setOrg(e.target.value)} className="w-full rounded-xl border border-line-strong bg-panel-2 text-fg placeholder:text-faint py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" placeholder="Northside Legal Aid" /></div></label>
            {error && <div className="rounded-xl border border-accent bg-ember-100/10 px-3 py-2 text-xs font-semibold text-ember-100">{error}</div>}
            <button disabled={loading} className="w-full rounded-full bg-accent py-3 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60">{loading ? "Creating account…" : "Create account"}</button>
            <p className="text-center text-[11px] leading-relaxed text-muted">By creating an account you agree this is a hackathon demo using fictional data. Do not upload real client documents.</p>
          </form>
          <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
