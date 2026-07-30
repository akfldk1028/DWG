import type { CadReportInput } from "./index.js";
import { canonicalReport } from "./index.js";
import { BoundedTextWriter } from "./textWriter.js";

export function createCsvReport(input: CadReportInput): string {
  const normalized = canonicalReport(input) as unknown as CadReportInput;
  const rows: string[][] = [["section", "id", "type", "layer", "text", "detail"]];
  for (const entity of normalized.document.index.entities) {
    rows.push(["entity", entity.id, entity.type, entity.layer, entity.text ?? "", geometryDetail(entity.geometry)]);
  }
  for (const finding of normalized.findings?.findings ?? []) {
    rows.push(["finding", finding.id, finding.type, finding.layer, finding.text ?? "", finding.reason]);
  }
  for (const warning of normalized.findings?.warnings ?? []) rows.push(["warning", "", "", "", warning, ""]);
  for (const transactionId of normalized.changeSet?.transactionIds ?? []) {
    rows.push(["transaction", transactionId, "", "", "", ""]);
  }
  for (const change of normalized.changeSet?.changes ?? []) {
    rows.push(["change", change.commandId, change.kind, "", "", change.targetId]);
  }
  const writer = new BoundedTextWriter();
  writer.append("\uFEFF");
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) writer.append("\r\n");
    row.forEach((cell, cellIndex) => {
      if (cellIndex > 0) writer.append(",");
      writer.append(csvCell(cell));
    });
  });
  writer.append("\r\n");
  return writer.finish();
}

function geometryDetail(geometry: CadReportInput["document"]["index"]["entities"][number]["geometry"]): string {
  return geometry.kind === "line" ? "line" : `Unsupported geometry: ${geometry.kind === "unavailable" || geometry.kind === "bbox" ? geometry.reason : geometry.kind}`;
}

function csvCell(value: string): string {
  const literal = /^[\p{White_Space}\p{Cc}]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(literal) ? `"${literal.replaceAll('"', '""')}"` : literal;
}
