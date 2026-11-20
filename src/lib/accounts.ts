// Sign-in for the demo build. There is no server or database, so accounts
// live in the browser:
// - The built-in demo accounts come from src/data/demo-data.ts.
// - Sign-ups are stored in this browser only (IndexedDB), with a bcrypt hash
//   of the password — never the password itself.
// This identifies who did what in the audit trail. It is NOT a security
// boundary: anyone with access to the browser can read its storage.

import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEFAULT_ORG } from "@/data/demo-data";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "./password";
import { normalizeRole, ROLE_LABELS, type Role } from "./roles";
import type { User } from "./core";
import { str } from "./validate";

export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  org: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export class AuthError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function toUser(a: { id: string; name: string; email: string; role: string; org: string }): User {
  const role = normalizeRole(a.role);
  return { id: a.id, name: a.name, email: a.email, role, roleLabel: ROLE_LABELS[role], org: a.org || DEFAULT_ORG };
}

/** Finds the user for a stored sign-in (by account id). */
export function findUser(accounts: LocalAccount[], id: string | undefined): User | null {
  if (!id) return null;
  const a = DEMO_ACCOUNTS.find((d) => d.id === id) || accounts.find((l) => l.id === id);
  return a ? toUser(a) : null;
}

export async function authenticate(accounts: LocalAccount[], email: string, password: string): Promise<User> {
  const em = normalizeEmail(email);
  if (!em || !password) throw new AuthError("Enter your email and password.");
  const demo = DEMO_ACCOUNTS.find((d) => d.email === em);
  if (demo) {
    if (password === DEMO_PASSWORD) return toUser(demo);
    throw new AuthError("Invalid email or password.");
  }
  const local = accounts.find((a) => a.email === em);
  if (local && (await verifyPassword(password, local.passwordHash))) return toUser(local);
  throw new AuthError("Invalid email or password.");
}

export async function createAccount(
  accounts: LocalAccount[],
  input: { name: string; email: string; password: string; org: string },
  id: string,
  now = new Date().toISOString()
): Promise<{ accounts: LocalAccount[]; user: User }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new AuthError("Enter a valid email address.");
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (input.password.length > 200) throw new AuthError("Password is too long.");
  if (DEMO_ACCOUNTS.some((d) => d.email === email) || accounts.some((a) => a.email === email)) {
    throw new AuthError("An account with this email already exists in this browser.");
  }
  const account: LocalAccount = {
    id, email,
    name: str(input.name, 120) || "Case Worker",
    org: str(input.org, 160) || DEFAULT_ORG,
    role: "case_worker",
    passwordHash: await hashPassword(input.password),
    createdAt: now,
  };
  return { accounts: [...accounts, account], user: toUser(account) };
}
