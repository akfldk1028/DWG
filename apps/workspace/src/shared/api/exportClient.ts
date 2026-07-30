import { parseExportCapabilitiesResponse, type ExportCapabilitiesResponse } from "@dwg/contracts";

import { getJson } from "./httpClient";

export function loadExportCapabilities(signal?: AbortSignal): Promise<ExportCapabilitiesResponse> {
  return getJson("/api/export/capabilities", signal, isExportCapabilitiesResponse);
}

function isExportCapabilitiesResponse(value: unknown): value is ExportCapabilitiesResponse {
  try {
    parseExportCapabilitiesResponse(value);
    return true;
  } catch {
    return false;
  }
}
