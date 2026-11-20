import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractDocument } from "../src/lib/extract";
import { runAnalysis, DocItem } from "../src/lib/core";
import { seedCases } from "../src/data/demo-data";

// Builds a minimal but valid single-page PDF with the given text.
function makePdf(text: string): Buffer {
  const content = `BT /F1 24 Tf 100 700 Td (${text}) Tj ET`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

// Builds a minimal but valid DOCX containing the given text.
async function makeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word")!.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("real document extraction", () => {
  it("extracts text from a real PDF buffer", async () => {
    const result = await extractDocument(makePdf("Maria Gonzalez owes 2900 dollars"), "test.pdf");
    expect(result.type).toBe("PDF");
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Maria Gonzalez");
    expect(result.text).toContain("2900");
  });

  it("extracts text from a real DOCX buffer", async () => {
    const result = await extractDocument(await makeDocx("James Carter appeal deadline May 28 2026"), "test.docx");
    expect(result.type).toBe("DOCX");
    expect(result.text).toContain("James Carter");
  });

  it("extracts text from TXT", async () => {
    const result = await extractDocument(Buffer.from("Hello Aisha Thompson", "utf-8"), "note.txt");
    expect(result.text).toContain("Aisha Thompson");
  });
});

describe("evidence attribution (runAnalysis)", () => {
  const c = seedCases()[0];
  const docs: DocItem[] = [
    { id: "docA", caseId: c.id, name: "Lease.pdf", type: "PDF", size: 100, status: "processed", extractedText: "Tenant Maria Gonzalez pays $1,450 monthly", pageCount: 1, uploadedAt: "2026-01-01T00:00:00Z", source: "Upload" },
    { id: "docB", caseId: c.id, name: "Notice.pdf", type: "PDF", size: 100, status: "processed", extractedText: "Arrears $2,900 due May 9, 2026", pageCount: 1, uploadedAt: "2026-01-01T00:00:00Z", source: "Upload" },
  ];

  it("attributes every fact to its actual document", () => {
    const result = runAnalysis(c, docs);
    const leaseFacts = result.extractions.filter((e) => e.documentId === "docA");
    const noticeFacts = result.extractions.filter((e) => e.documentId === "docB");
    expect(leaseFacts.length).toBeGreaterThan(0);
    expect(noticeFacts.length).toBeGreaterThan(0);
    expect(leaseFacts.every((e) => e.sourceDoc === "Lease.pdf")).toBe(true);
    expect(noticeFacts.every((e) => e.sourceDoc === "Notice.pdf")).toBe(true);
    expect(leaseFacts.some((e) => e.fieldValue.includes("1,450"))).toBe(true);
    expect(noticeFacts.some((e) => e.fieldValue.includes("2,900"))).toBe(true);
    // No fact may be attributed to a document it did not come from.
    expect(result.extractions.every((e) => e.documentId === "docA" || e.documentId === "docB")).toBe(true);
  });

  it("attributes facts to the correct page using form-feed page separators", () => {
    const multi: DocItem = { ...docs[0], extractedText: "First page mentions $1,100\fSecond page: $9,999 on April 1, 2026", pageCount: 2 };
    const result = runAnalysis(c, [multi]);
    const page2 = result.extractions.filter((e) => e.sourcePage === 2);
    expect(page2.length).toBeGreaterThan(0);
    expect(page2.every((e) => e.documentId === "docA")).toBe(true);
    expect(page2.some((e) => e.fieldValue.includes("9,999"))).toBe(true);
  });

  it("cites evidence with document and page in the recommendation", () => {
    const result = runAnalysis(c, docs);
    expect(result.recommendation.evidence.length).toBeGreaterThan(0);
    expect(result.recommendation.evidence.every((ev) => ev.doc && ev.page >= 1 && ev.snippet)).toBe(true);
  });
});
