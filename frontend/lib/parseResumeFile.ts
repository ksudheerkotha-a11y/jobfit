const TEXT_EXTENSIONS = [".txt", ".md"];

export class UnsupportedResumeFileError extends Error {}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function parsePlainText(file: File): Promise<string> {
  return file.text();
}

/** Extract plain text from a resume file: .txt/.md read directly, .pdf via
 * pdfjs-dist, .docx via mammoth — all client-side, no upload to a server.
 * Legacy binary .doc is not supported (that format has no practical
 * client-side parser); callers should ask the user to save as .docx/.pdf
 * or paste text instead. */
export async function parseResumeFile(file: File): Promise<string> {
  const ext = extOf(file.name);

  if (ext === ".pdf") return parsePdf(file);
  if (ext === ".docx") return parseDocx(file);
  if (TEXT_EXTENSIONS.includes(ext)) return parsePlainText(file);
  if (ext === ".doc") {
    throw new UnsupportedResumeFileError(
      "Old .doc files aren't supported — please save as .docx or PDF, or paste the text instead."
    );
  }
  throw new UnsupportedResumeFileError(
    `Unsupported file type "${ext || file.name}" — use PDF, .docx, .txt, or .md.`
  );
}
