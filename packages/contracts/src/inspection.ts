import type { CadPointBox } from "./cad.js";

export type InspectionCheck =
  | { kind: "layer"; value: string }
  | { kind: "type"; value: string }
  | { kind: "text"; value: string; regex?: boolean };

export interface InspectionPayload {
  checks: InspectionCheck[];
}

export interface InspectionEvent {
  sequence: number;
  agentId:
    | "orchestrator"
    | "drawing-index-agent"
    | "search-agent"
    | "rule-check-agent"
    | "evidence-agent"
    | "viewer-agent"
    | "report-agent";
  action: string;
  status: "planned" | "completed" | "rejected";
}

export interface InspectionFinding {
  id: string;
  handle: string | null;
  type: string;
  layer: string;
  bbox: CadPointBox | null;
  text?: string | null;
  reason: string;
  confidence: number;
}

export type InspectionEvidenceField = "id" | "handle" | "type" | "layer" | "bbox";

export interface InspectionIssue {
  entityId: string;
  missing: InspectionEvidenceField[];
}

export interface InspectionRun {
  status: "completed" | "rejected";
  drawingId: string;
  events: InspectionEvent[];
  findings: InspectionFinding[];
  issues: InspectionIssue[];
  warnings: string[];
}

export function isInspectionPayload(value: unknown): value is InspectionPayload {
  if (!isRecord(value) || !hasOnlyKeys(value, ["checks"])) return false;
  if (!Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 8) {
    return false;
  }
  return value.checks.every(isInspectionCheck);
}

function isInspectionCheck(value: unknown): value is InspectionCheck {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (
    typeof value.value !== "string" ||
    value.value.trim().length < 1 ||
    value.value.length > 200
  ) {
    return false;
  }
  if (value.kind === "text") {
    return (
      hasOnlyKeys(value, ["kind", "value", "regex"]) &&
      (value.regex === undefined || typeof value.regex === "boolean")
    );
  }
  return (
    (value.kind === "layer" || value.kind === "type") &&
    hasOnlyKeys(value, ["kind", "value"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}
