import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { extractDocument } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Real document text extraction endpoint.
// Accepts multipart form data with a "file" field (PDF, DOCX, TXT, CSV, MD)
// and returns the extracted text with per-page structure (pages joined by \f).
// PDF parsing uses PDF.js (via unpdf); DOCX parsing uses mammoth.

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractDocument(buffer, file.name);
    return NextResponse.json({ name: file.name, ...result });
  } catch (e) {
    return NextResponse.json({ error: `Extraction failed: ${String(e)}` }, { status: 500 });
  }
}
