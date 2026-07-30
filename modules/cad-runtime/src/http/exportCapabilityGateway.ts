import type { IncomingMessage, ServerResponse } from "node:http";

import { parseExportCapabilitiesResponse, type ExportCapabilitiesResponse } from "@dwg/contracts";

export interface ExportCapabilityRoutes {
  handle(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean>;
}

const unavailableCapabilities: ExportCapabilitiesResponse = parseExportCapabilitiesResponse({
  capabilities: [
    { format: "json", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
    { format: "csv", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
    { format: "pdf", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
    { format: "svg", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
    { format: "dxf", kind: "drawing", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
    { format: "dwg", kind: "drawing", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" }
  ]
});

export function createExportCapabilityRoutes(): ExportCapabilityRoutes {
  return {
    async handle(request, response, pathname) {
      if (request.method !== "GET" || pathname !== "/api/export/capabilities") return false;
      response.statusCode = 200;
      response.end(JSON.stringify(unavailableCapabilities));
      return true;
    }
  };
}
