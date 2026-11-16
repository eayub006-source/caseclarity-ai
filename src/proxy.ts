import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// CSRF protection for the API. Session cookies are SameSite=Lax, and on top of
// that every state-changing API request from a browser must come from this
// site: the Origin header (or, failing that, Sec-Fetch-Site) must match.
// Requests without either header (curl, server-to-server) are allowed — they
// cannot carry a victim's cookies.

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(req: NextRequest) {
  if (SAFE.has(req.method)) return NextResponse.next();

  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* invalid origin */ }
    if (!host || originHost !== host) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    return NextResponse.next();
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
