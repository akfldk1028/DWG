import type { CadReportInput } from "./index.js";
import { canonicalReport, stableJson } from "./index.js";

export function createJsonReport(input: CadReportInput): string {
  return `${stableJson(canonicalReport(input))}\n`;
}
