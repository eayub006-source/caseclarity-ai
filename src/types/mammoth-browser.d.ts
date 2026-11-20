// mammoth's self-contained browser build (used by src/lib/extract.ts).
declare module "mammoth/mammoth.browser.min.js" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
