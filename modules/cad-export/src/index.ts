import { createHash } from "node:crypto";

import type {
  CadChange,
  CadOutputVerification,
  InspectionRun,
  ReportFormat
} from "@dwg/contracts";
import type { CadDocumentSnapshot } from "@dwg/cad-document";

import { createCsvReport } from "./csvReport.js";
import { createJsonReport } from "./jsonReport.js";
import { createPdfReport } from "./pdfReport.js";
import { createSvgReport } from "./svgReport.js";

export const MAX_REPORT_BYTES = 1_048_576;

/** Internal application input; it is deliberately not a @dwg/contracts DTO. */
export interface CadReportInput {
  document: CadDocumentSnapshot;
  findings: InspectionRun | null;
  changeSet: CadReportChangeSet | null;
  verification: CadOutputVerification | null;
}

export interface CadReportChangeSet {
  documentId: string;
  revision: number;
  transactionIds: string[];
  changes: CadChange[];
}

export interface ExportedReport {
  format: ReportFormat;
  mediaType: string;
  filename: string;
  bytes: Uint8Array;
  sha256: string;
}

export async function exportCadReport(
  input: CadReportInput,
  format: ReportFormat
): Promise<ExportedReport> {
  const body = createReportBody(input, format);
  const bytes = encodeBounded(body);
  return {
    format,
    mediaType: mediaTypeFor(format),
    filename: reportFilename(input.document, format),
    bytes,
    sha256: sha256(bytes)
  };
}

export function canonicalReport(input: CadReportInput): Record<string, unknown> {
  return canonicalize({
    document: input.document,
    findings: input.findings,
    changeSet: input.changeSet === null ? null : {
      ...input.changeSet,
      transactionIds: [...input.changeSet.transactionIds].sort(),
      changes: [...input.changeSet.changes].sort(compareChanges)
    },
    verification: input.verification === null ? null : {
      ...input.verification,
      copiedHandleMap: Object.fromEntries(Object.entries(input.verification.copiedHandleMap).sort(([left], [right]) => compareText(left, right))),
      warnings: [...input.verification.warnings].sort()
    }
  }) as Record<string, unknown>;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function encodeBounded(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_REPORT_BYTES) {
    throw new Error("EXPORT_REPORT_BYTE_LIMIT");
  }
  return bytes;
}

export function reportLines(input: CadReportInput): string[] {
  const report = canonicalReport(input);
  return stableJson(report).match(/.{1,120}/gu) ?? ["{}"];
}

function createReportBody(input: CadReportInput, format: ReportFormat): string {
  switch (format) {
    case "json": return createJsonReport(input);
    case "csv": return createCsvReport(input);
    case "pdf": return createPdfReport(input);
    case "svg": return createSvgReport(input);
  }
}

function mediaTypeFor(format: ReportFormat): string {
  switch (format) {
    case "json": return "application/json; charset=utf-8";
    case "csv": return "text/csv; charset=utf-8";
    case "pdf": return "application/pdf";
    case "svg": return "image/svg+xml; charset=utf-8";
  }
}

function reportFilename(document: CadDocumentSnapshot, format: ReportFormat): string {
  const source = document.index.source.displayName.replace(/\.[^.]+$/u, "");
  const stem = source
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-._]+|[-._]+$/gu, "")
    .slice(0, 96) || "drawing";
  return `${stem}-rev-${document.revision}-report.${format}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function compareChanges(left: CadChange, right: CadChange): number {
  return compareText(left.commandId, right.commandId) || compareText(left.targetId, right.targetId) || compareText(left.kind, right.kind);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
