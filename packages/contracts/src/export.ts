export const REPORT_FORMATS = ["json", "csv", "pdf", "svg"] as const;
export const DRAWING_FORMATS = ["dxf", "dwg"] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];
export type DrawingFormat = (typeof DRAWING_FORMATS)[number];
export type ExportFormat = ReportFormat | DrawingFormat;
export type ExportKind = "report" | "drawing";

export const MAX_CAD_OUTPUT_VERIFICATION_ID_CHARS = 256;
export const MAX_CAD_OUTPUT_VERIFICATION_VERSION_CHARS = 128;
export const MAX_CAD_OUTPUT_VERIFICATION_HANDLE_MAP_ENTRIES = 10_000;
export const MAX_CAD_OUTPUT_VERIFICATION_WARNINGS = 100;
export const MAX_CAD_OUTPUT_VERIFICATION_WARNING_CHARS = 512;

/** Serializable proof that a generated drawing was independently verified. */
export interface CadOutputVerification {
  id: string;
  status: "passed" | "failed";
  format: DrawingFormat;
  version: string;
  sourceSha256: string;
  outputSha256: string;
  intendedChangeCount: number;
  verifiedChangeCount: number;
  copiedHandleMap: Record<string, string>;
  warnings: string[];
}

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

export function parseCadOutputVerification(value: unknown): CadOutputVerification {
  const object = cadOutputRecord(value);
  const expectedKeys = [
    "id",
    "status",
    "format",
    "version",
    "sourceSha256",
    "outputSha256",
    "intendedChangeCount",
    "verifiedChangeCount",
    "copiedHandleMap",
    "warnings"
  ];
  if (
    !hasExactKeys(object, expectedKeys) ||
    !isBoundedString(object.id, MAX_CAD_OUTPUT_VERIFICATION_ID_CHARS) ||
    (object.status !== "passed" && object.status !== "failed") ||
    !DRAWING_FORMATS.includes(object.format as DrawingFormat) ||
    !isBoundedString(object.version, MAX_CAD_OUTPUT_VERIFICATION_VERSION_CHARS) ||
    !isSha256(object.sourceSha256) ||
    !isSha256(object.outputSha256) ||
    !isSafeCount(object.intendedChangeCount) ||
    !isSafeCount(object.verifiedChangeCount) ||
    !isBoundedHandleMap(object.copiedHandleMap) ||
    !isBoundedWarnings(object.warnings)
  ) {
    throw new Error("CAD_OUTPUT_VERIFICATION_INVALID");
  }

  return {
    id: object.id,
    status: object.status,
    format: object.format as DrawingFormat,
    version: object.version,
    sourceSha256: object.sourceSha256.toUpperCase(),
    outputSha256: object.outputSha256.toUpperCase(),
    intendedChangeCount: object.intendedChangeCount,
    verifiedChangeCount: object.verifiedChangeCount,
    copiedHandleMap: Object.fromEntries(
      Object.entries(object.copiedHandleMap).sort(([left], [right]) => compareText(left, right))
    ),
    warnings: [...object.warnings]
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
  return value as Record<string, unknown>;
}

function cadOutputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CAD_OUTPUT_VERIFICATION_INVALID");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, expected: string[]) {
  if (!hasExactKeys(value, expected)) {
    throw new Error("EXPORT_CAPABILITIES_RESPONSE_INVALID");
  }
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/iu.test(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isBoundedHandleMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_CAD_OUTPUT_VERIFICATION_HANDLE_MAP_ENTRIES &&
    entries.every(([key, mapped]) => isBoundedString(key, 256) && isBoundedString(mapped, 256))
  );
}

function isBoundedWarnings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_CAD_OUTPUT_VERIFICATION_WARNINGS &&
    value.every((warning) => isBoundedString(warning, MAX_CAD_OUTPUT_VERIFICATION_WARNING_CHARS))
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
