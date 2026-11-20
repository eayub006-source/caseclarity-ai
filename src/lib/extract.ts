// Real document text extraction. It runs in the browser, so uploaded files
// never leave the visitor's machine: only the extracted text is kept, and it
// is sent to a server only for Live AI analysis. The same code runs in Node
// for the tests. Both parsers are loaded on demand, so they cost nothing
// until a file is uploaded.
// - PDF: Mozilla PDF.js via unpdf, real per-page text.
// - DOCX: mammoth's self-contained browser build (real OOXML parsing). DOCX
//   has no fixed pages, so the text is split into estimated pages (~1,800
//   characters, at paragraph boundaries).
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

export class UnsupportedFileError extends Error {}
export class FileTooLargeError extends Error {}

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

interface MammothLike { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }

async function docxToText(bytes: Uint8Array): Promise<string> {
  // mammoth's browser build bundles its own dependencies (no Node built-ins),
  // so it works in every runtime. It needs an ArrayBuffer holding just the file.
  const mod = (await import("mammoth/mammoth.browser.min.js")) as unknown as MammothLike & { default?: MammothLike };
  const mammoth = mod.default ?? mod;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

export async function extractDocument(bytes: Uint8Array, filename: string): Promise<ExtractResult> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new FileTooLargeError("File exceeds the 10 MB limit");

  if (ext === "pdf") {
    const { extractText } = await import("unpdf");
    // PDF.js may take ownership of the buffer it is given, so pass a copy.
    const { text, totalPages } = await extractText(new Uint8Array(bytes), { mergePages: false });
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
    const raw = await docxToText(bytes);
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
    const raw = new TextDecoder("utf-8").decode(bytes);
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

/** Reads a browser File and extracts its text. */
export async function extractFile(file: File): Promise<ExtractResult & { name: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError("File exceeds the 10 MB limit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return { name: file.name, ...(await extractDocument(bytes, file.name)) };
  } catch (e) {
    if (e instanceof UnsupportedFileError || e instanceof FileTooLargeError) throw e;
    throw new Error("Could not read this file. It may be corrupted or password-protected.");
  }
}
