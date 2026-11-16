// Role model shared by server and client.
// - case_worker:         default for new sign-ups; can work cases and review recommendations.
// - senior_case_worker:  can also delete cases and reset demo data.
// - admin:               same as senior_case_worker (reserved for future admin screens).

export type Role = "case_worker" | "senior_case_worker" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  case_worker: "Case Worker",
  senior_case_worker: "Senior Case Worker",
  admin: "Administrator",
};

// Accepts keys ("senior_case_worker") and legacy labels ("Senior Case Worker").
export function normalizeRole(raw: string | null | undefined): Role {
  const k = (raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (k === "admin" || k === "administrator") return "admin";
  if (k === "senior_case_worker" || k === "supervisor") return "senior_case_worker";
  return "case_worker";
}

export function canManage(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "senior_case_worker";
}
