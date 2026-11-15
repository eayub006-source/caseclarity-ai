import { extractText } from "unpdf";
import mammoth from "mammoth";

// Real server-side document text extraction.
// - PDF: Mozilla PDF.js via unpdf, per-page text (pages joined with \f).
// - DOCX: mammoth (real OOXML parsing).
// - TXT / CSV / MD: UTF-8 decode.
// Pages are joined with a form-feed (\f) character so downstream analysis can
// attribute every extracted fact to its actual page number.

export interface ExtractResult {
  text: string;
  pageCount: number;
  type: string;
  warning?: string;
}

export async function extractDocument(buffer: Buffer, filename: string): Promise<ExtractResult> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "pdf") {
    const { text, totalPages } = await extractText(new Uint8Array(buffer), { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    const joined = pages.join("\f");
    return {
      text: joined,
      pageCount: totalPages || pages.length,
      type: "PDF",
      warning: joined.trim() ? undefined : "No extractable text found — the PDF may be scanned/image-based.",
    };
  }

  if (ext === "docx") {
    // mammoth's Node build accepts a Node Buffer via options.buffer.
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || "";
    return {
      text,
      pageCount: Math.max(1, Math.round(text.length / 1800)),
      type: "DOCX",
      warning: text.trim() ? undefined : "No extractable text found in this DOCX.",
    };
  }

  if (ext === "txt" || ext === "csv" || ext === "md") {
    const text = buffer.toString("utf-8");
    return { text, pageCount: Math.max(1, Math.round(text.length / 1800)), type: ext.toUpperCase() };
  }

  return { text: "", pageCount: 1, type: ext.toUpperCase() || "UNKNOWN", warning: `Unsupported file type ".${ext}". Upload PDF, DOCX, TXT or CSV.` };
}
