import type { CadReportInput } from "./index.js";
import { canonicalReport, compareText, stableJson } from "./index.js";

export function createSvgReport(input: CadReportInput): string {
  const entities = [...input.document.index.entities].sort((left, right) => compareText(left.id, right.id));
  const lines: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 800 600" role="img">',
    `<title>${escapeXml(input.document.index.source.displayName)} CAD report</title>`,
    `<desc>${escapeXml(stableJson(canonicalReport(input)))}</desc>`,
    '<rect width="800" height="600" fill="white"/>',
    `<text x="16" y="24" font-family="monospace" font-size="14">${escapeXml(input.document.documentId)} revision ${input.document.revision}</text>`
  ];
  let textY = 48;
  for (const entity of entities) {
    if (entity.geometry.kind === "line") {
      lines.push(`<line x1="${entity.geometry.start[0]}" y1="${entity.geometry.start[1]}" x2="${entity.geometry.end[0]}" y2="${entity.geometry.end[1]}" stroke="black"/>`);
      continue;
    }
    const reason = entity.geometry.kind === "unavailable" || entity.geometry.kind === "bbox"
      ? entity.geometry.reason
      : entity.geometry.kind;
    lines.push(`<text x="16" y="${textY}" font-family="monospace" font-size="12">Unsupported geometry: ${escapeXml(reason)} (${escapeXml(entity.id)})</text>`);
    textY += 16;
  }
  lines.push("</svg>");
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
