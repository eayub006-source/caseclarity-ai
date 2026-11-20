export const dynamic = "force-dynamic";

// Liveness check for hosting platforms. There is no database to check:
// all case data lives in each visitor's browser.
export async function GET() {
  return Response.json({ ok: true });
}
