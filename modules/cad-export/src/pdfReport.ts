import { Buffer } from "node:buffer";

import type { CadReportInput } from "./index.js";
import { canonicalReport, reportLines } from "./index.js";
import { BoundedTextWriter } from "./textWriter.js";

export function createPdfReport(input: CadReportInput): string {
  const normalized = canonicalReport(input) as unknown as CadReportInput;
  const textLines = [
    `${normalized.document.index.source.displayName} CAD report`,
    `Document: ${normalized.document.documentId}; revision: ${normalized.document.revision}`,
    ...unsupportedLines(normalized),
    ...reportLines(normalized)
  ];
  const contentWriter = new BoundedTextWriter();
  contentWriter.append("BT\n/F1 9 Tf\n48 792 Td");
  for (const [index, line] of textLines.entries()) {
    if (index > 0) contentWriter.append("\n0 -12 Td");
    contentWriter.append(`\n(${escapePdfText(line)}) Tj`);
  }
  contentWriter.append("\nET");
  const content = contentWriter.finish();
  const writer = new BoundedTextWriter();
  writer.append("%PDF-1.7\n%CAD-REPORT\n");
  const offsets = [0];
  const simpleObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
  ];
  simpleObjects.forEach((object, index) => {
    offsets.push(writer.byteLength);
    writer.append(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  offsets.push(writer.byteLength);
  writer.append(`5 0 obj\n<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n`);
  writer.append(content);
  writer.append("\nendstream\nendobj\n");
  const xrefOffset = writer.byteLength;
  writer.append("xref\n0 6\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    writer.append(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  }
  writer.append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return writer.finish();
}

function unsupportedLines(input: CadReportInput): string[] {
  return [...input.document.index.entities]
    .filter((entity) => entity.geometry.kind !== "line")
    .map((entity) => {
      const geometry = entity.geometry;
      const reason = geometry.kind === "unavailable" || geometry.kind === "bbox" ? geometry.reason : geometry.kind;
      return `Unsupported geometry: ${reason} (${entity.id})`;
    });
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/gu, "\\$&").replace(/[^\x20-\x7e]/gu, "?");
}
