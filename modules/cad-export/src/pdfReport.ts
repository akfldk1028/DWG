import type { CadReportInput } from "./index.js";
import { compareText, reportLines } from "./index.js";

export function createPdfReport(input: CadReportInput): string {
  const textLines = [
    `${input.document.index.source.displayName} CAD report`,
    `Document: ${input.document.documentId}; revision: ${input.document.revision}`,
    ...unsupportedLines(input),
    ...reportLines(input)
  ];
  const stream = ["BT", "/F1 9 Tf", "48 792 Td"];
  for (const [index, line] of textLines.entries()) {
    if (index > 0) stream.push("0 -12 Td");
    stream.push(`(${escapePdfText(line)}) Tj`);
  }
  stream.push("ET");
  const content = stream.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${new TextEncoder().encode(content).byteLength} >>\nstream\n${content}\nendstream`
  ];
  let result = "%PDF-1.7\n%CAD-REPORT\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(result).byteLength);
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(result).byteLength;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`).join("");
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return result;
}

function unsupportedLines(input: CadReportInput): string[] {
  return [...input.document.index.entities]
    .filter((entity) => entity.geometry.kind !== "line")
    .sort((left, right) => compareText(left.id, right.id))
    .map((entity) => {
      const geometry = entity.geometry;
      const reason = geometry.kind === "unavailable" || geometry.kind === "bbox" ? geometry.reason : geometry.kind;
      return `Unsupported geometry: ${reason} (${entity.id})`;
    });
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/gu, "\\$&").replace(/[^\x20-\x7e]/gu, "?");
}
