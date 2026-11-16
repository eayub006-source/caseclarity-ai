import { extractText } from "unpdf";
import mammoth from "mammoth";

// Real server-side document text extraction.
// - PDF: Mozilla PDF.js via unpdf, real per-page text.
// - DOCX: mammoth (real OOXML parsing). DOCX has no fixed pages, so the text is
//   split into estimated pages (~1,800 characters, at paragraph boundaries).
// - TXT / CSV / MD: UTF-8 decode, split into estimated pages the same way.
// Pages are joined with a form-feed (\f) character so downstream analysis can
// attribute every extracted fact to a page number.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const EST_PAGE_CHARS = 1800;

export interface ExtractResult {
  text: string;
  pageCount: number;
  type: string;
  pagesEstimated: boolean;
  warning?: string;
}

// Splits text into ~pageChars pages, breaking at blank lines, then lines,
// then spaces, so a page boundary never cuts a word in half.
export function paginate(text: string, pageChars = EST_PAGE_CHARS): string[] {
  const clean = text.replace(/\f/g, "\n");
  if (clean.length <= pageChars) return [clean];
  const pages: string[] = [];
  let rest = clean;
  while (rest.length > pageChars) {
    const window = rest.slice(0, pageChars);
    let cut = window.lastIndexOf("\n\n");
    if (cut < pageChars * 0.5) cut = window.lastIndexOf("\n");
    if (cut < pageChars * 0.5) cut = window.lastIndexOf(" ");
    if (cut < pageChars * 0.5) cut = pageChars;
    pages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.trim()) pages.push(rest.trim());
  return pages;
}

const ESTIMATED_NOTE = "Page numbers for this file type are estimated (~1,800 characters per page).";

export async function extractDocument(buffer: Buffer, filename: string): Promise<ExtractResult> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "pdf") {
    const { text, totalPages } = await extractText(new Uint8Array(buffer), { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((p) => p.replace(/\f/g, "\n"));
    const joined = pages.join("\f");
    return {
      text: joined,
      pageCount: totalPages || pages.length,
      type: "PDF",
      pagesEstimated: false,
      warning: joined.replace(/\f/g, "").trim() ? undefined : "No extractable text found — the PDF may be scanned/image-based (OCR is not supported yet).",
    };
  }

  if (ext === "docx") {
    // mammoth's Node build accepts a Node Buffer via options.buffer.
    const result = await mammoth.extractRawText({ buffer });
    const raw = result.value || "";
    const pages = paginate(raw);
    return {
      text: pages.join("\f"),
      pageCount: pages.length,
      type: "DOCX",
      pagesEstimated: true,
      warning: raw.trim() ? (pages.length > 1 ? ESTIMATED_NOTE : undefined) : "No extractable text found in this DOCX.",
    };
  }

  if (ext === "txt" || ext === "csv" || ext === "md") {
    const raw = buffer.toString("utf-8");
    const pages = paginate(raw);
    return {
      text: pages.join("\f"),
      pageCount: pages.length,
      type: ext.toUpperCase(),
      pagesEstimated: true,
      warning: raw.trim() ? (pages.length > 1 ? ESTIMATED_NOTE : undefined) : "The file is empty.",
    };
  }

  throw new UnsupportedFileError(`Unsupported file type ".${ext}". Upload PDF, DOCX, TXT, CSV or MD.`);
}

export class UnsupportedFileError extends Error {}
