import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
const [file, kind] = process.argv.slice(2);
const buffer = await readFile(file);
let text = "";
if (kind === "txt")
  text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
else if (kind === "docx")
  text = (await mammoth.extractRawText({ buffer })).value;
else if (kind === "pdf") {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const document = await loading.promise;
  if (document.numPages > 40)
    throw new Error("Resume exceeds the 40-page limit.");
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((item: any) => item.str + (item.hasEOL ? "\n" : " "))
        .join("") + "\n";
  }
  await loading.destroy();
} else throw new Error("Unsupported file type");
if (text.trim().length < 20)
  throw new Error(
    "No readable text found. Upload a text-based PDF/DOCX or a text version; scanned files need OCR.",
  );
if (text.length > 150000) throw new Error("Extracted text exceeds the limit.");
process.stdout.write(JSON.stringify({ text: text.trim() }));
