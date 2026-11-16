import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { extractDocument, MAX_UPLOAD_BYTES, UnsupportedFileError } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Real document text extraction endpoint.
// Accepts multipart form data with a "file" field (PDF, DOCX, TXT, CSV, MD)
// and returns the extracted text with per-page structure (pages joined by \f).

// The file plus multipart overhead (boundaries, headers).
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const tooLarge = () => NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 });

// Reads the request body, stopping as soon as it exceeds `limit` bytes.
async function readCapped(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | "too_large"> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  // Reject oversized uploads early when the client declares the size...
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_BODY_BYTES) return tooLarge();

  // ...and enforce the cap while streaming, because Content-Length can be
  // missing (chunked upload) or wrong. Never buffer more than MAX_BODY_BYTES.
  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === "too_large") return tooLarge();

  let form: FormData;
  try {
    form = await new Response(raw, { headers: { "content-type": req.headers.get("content-type") || "" } }).formData();
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
