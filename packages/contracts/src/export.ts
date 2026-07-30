export const REPORT_FORMATS = ["json", "csv", "pdf", "svg"] as const;
export const DRAWING_FORMATS = ["dxf", "dwg"] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];
export type DrawingFormat = (typeof DRAWING_FORMATS)[number];
export type ExportFormat = ReportFormat | DrawingFormat;
export type ExportKind = "report" | "drawing";

export interface ExportCapabilityItem {
  format: ExportFormat;
  kind: ExportKind;
  available: boolean;
  reason: string | null;
}

export interface ExportCapabilitiesResponse {
  capabilities: ExportCapabilityItem[];
}

const formats = new Set<ExportFormat>([...REPORT_FORMATS, ...DRAWING_FORMATS]);
const exportKinds = new Set<ExportKind>(["report", "drawing"]);

export function parseExportCapabilitiesResponse(value: unknown): ExportCapabilitiesResponse {
  const object = record(value);
  requireExactKeys(object, ["capabilities"]);
  if (!Array.isArray(object.capabilities) || object.capabilities.length !== formats.size) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
  const capabilities = object.capabilities.map(parseExportCapabilityItem);
  if (new Set(capabilities.map((item) => item.format)).size !== formats.size) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
  return { capabilities };
}

export function parseExportCapabilityItem(value: unknown): ExportCapabilityItem {
  const object = record(value);
  requireExactKeys(object, ["format", "kind", "available", "reason"]);
  if (!formats.has(object.format as ExportFormat) || !exportKinds.has(object.kind as ExportKind)) {
    throw new Error("EXPORT_CAPABILITY_ITEM_INVALID");
  }
  const format = object.format as ExportFormat;
  const kind = object.kind as ExportKind;
  if ((REPORT_FORMATS.includes(format as ReportFormat) ? "report" : "drawing") !== kind) {
    throw new Error("EXPORT_CAPABILITY_ITEM_INVALID");
  }
  if (typeof object.available !== "boolean") {
    throw new Error("EXPORT_CAPABILITY_ITEM_INVALID");
  }
  const reasonValid = object.available
    ? object.reason === null
    : typeof object.reason === "string" &&
      object.reason.trim().length > 0 &&
      object.reason.length <= 128;
  if (!reasonValid) {
    throw new Error("EXPORT_CAPABILITY_ITEM_INVALID");
  }
  return { format, kind, available: object.available, reason: object.reason as string | null };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== [...expected].sort()[index])) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
}
