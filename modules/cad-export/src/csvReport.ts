import type { CadReportInput } from "./index.js";
import { compareText } from "./index.js";

export function createCsvReport(input: CadReportInput): string {
  const rows: string[][] = [["section", "id", "type", "layer", "text", "detail"]];
  for (const entity of [...input.document.index.entities].sort((left, right) => compareText(left.id, right.id))) {
    rows.push(["entity", entity.id, entity.type, entity.layer, entity.text ?? "", geometryDetail(entity.geometry)]);
  }
  for (const finding of [...(input.findings?.findings ?? [])].sort((left, right) => compareText(left.id, right.id))) {
    rows.push(["finding", finding.id, finding.type, finding.layer, finding.text ?? "", finding.reason]);
  }
  for (const warning of [...(input.findings?.warnings ?? [])].sort()) rows.push(["warning", "", "", "", warning, ""]);
  for (const transactionId of [...(input.changeSet?.transactionIds ?? [])].sort(compareText)) {
    rows.push(["transaction", transactionId, "", "", "", ""]);
  }
  for (const change of [...(input.changeSet?.changes ?? [])].sort((left, right) => compareText(left.commandId, right.commandId) || compareText(left.targetId, right.targetId))) {
    rows.push(["change", change.commandId, change.kind, "", "", change.targetId]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function geometryDetail(geometry: CadReportInput["document"]["index"]["entities"][number]["geometry"]): string {
  return geometry.kind === "line" ? "line" : `Unsupported geometry: ${geometry.kind === "unavailable" || geometry.kind === "bbox" ? geometry.reason : geometry.kind}`;
}

function csvCell(value: string): string {
  const literal = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(literal) ? `"${literal.replaceAll('"', '""')}"` : literal;
}
