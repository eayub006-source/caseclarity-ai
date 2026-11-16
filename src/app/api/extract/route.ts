import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { extractDocument, MAX_UPLOAD_BYTES, UnsupportedFileError } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Real document text extraction endpoint.
// Accepts multipart form data with a "file" field (PDF, DOCX, TXT, CSV, MD)
// and returns the extracted text with per-page structure (pages joined by \f).

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  // Reject oversized uploads before reading the body into memory.
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload with a \"file\" field" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractDocument(buffer, file.name);
    return NextResponse.json({ name: file.name, ...result });
  } catch (e) {
    if (e instanceof UnsupportedFileError) return NextResponse.json({ error: e.message }, { status: 415 });
    console.error("Extraction failed", e);
    return NextResponse.json({ error: "Could not read this file. It may be corrupted or password-protected." }, { status: 422 });
  }
}
