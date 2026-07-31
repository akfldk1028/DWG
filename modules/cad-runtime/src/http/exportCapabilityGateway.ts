import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  parseCadDrawingExportRequest,
  parseCadDrawingExportResponse,
  parseCadOutputVerification,
  parseCadReportExportRequest,
  parseExportCapabilitiesResponse,
  type ExportCapabilitiesResponse
} from "@dwg/contracts";
import type { ExportedReport } from "@dwg/cad-export";

import type { CadApplication } from "../application/createCadApplication.js";
import { handleDestinationGrantRequest } from "./destinationGrantGateway.js";

export interface ExportCapabilityRoutes {
  handle(request: IncomingMessage, response: ServerResponse, pathname: string, signal?: AbortSignal): Promise<boolean>;
}

const capabilities: ExportCapabilitiesResponse = parseExportCapabilitiesResponse({
  capabilities: [
    { format: "json", kind: "report", available: true, reason: null },
    { format: "csv", kind: "report", available: true, reason: null },
    { format: "pdf", kind: "report", available: true, reason: null },
    { format: "svg", kind: "report", available: true, reason: null },
    { format: "dxf", kind: "drawing", available: true, reason: null },
    { format: "dwg", kind: "drawing", available: true, reason: null }
  ]
});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY_BYTES = 64 * 1024;

export function createExportCapabilityRoutes(
  application: CadApplication,
  clock: () => number = Date.now
): ExportCapabilityRoutes {
  const downloads = new Map<string, ExportedReport & { expiresAt: number }>();
  return {
    async handle(request, response, pathname, signal) {
      if (request.method === "GET" && pathname === "/api/export/capabilities") {
        sendJson(response, 200, capabilities);
        return true;
      }
      if (request.method === "POST" && pathname === "/api/export/destination-grants") {
        return handleDestinationGrantRequest(request, response, application, readJsonBody, signal);
      }
      if (request.method === "POST" && pathname === "/api/export/reports") {
        const input = parseCadReportExportRequest(await readJsonBody(request));
        const report = await application.capabilities.execute("export.report", input, signal) as ExportedReport;
        const downloadId = randomUUID();
        downloads.set(downloadId, { ...report, expiresAt: clock() + 10 * 60 * 1000 });
        sendJson(response, 200, {
          downloadId,
          filename: report.filename,
          mediaType: report.mediaType,
          sha256: report.sha256
        });
        return true;
      }
      if (request.method === "GET" && pathname.startsWith("/api/export/reports/")) {
        const id = pathname.slice("/api/export/reports/".length);
        const download = uuidPattern.test(id) ? downloads.get(id) : undefined;
        if (!download || download.expiresAt <= clock()) {
          downloads.delete(id);
          sendJson(response, 404, { error: "EXPORT_DOWNLOAD_UNKNOWN" });
          return true;
        }
        downloads.delete(id);
        response.statusCode = 200;
        response.setHeader("content-type", download.mediaType);
        response.setHeader("content-disposition", `attachment; filename="${download.filename}"`);
        response.setHeader("content-length", String(download.bytes.byteLength));
        response.end(Buffer.from(download.bytes));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/export/drawings") {
        const input = parseCadDrawingExportRequest(await readJsonBody(request));
        const verification = parseCadOutputVerification(
          await application.capabilities.execute("export.drawing", input, signal)
        );
        sendJson(response, 200, parseCadDrawingExportResponse({
          verificationId: verification.id,
          status: verification.status
        }));
        return true;
      }
      if (request.method === "GET" && pathname.startsWith("/api/export/verifications/")) {
        const id = pathname.slice("/api/export/verifications/".length);
        if (!uuidPattern.test(id)) {
          sendJson(response, 400, { error: "CAD_VERIFICATION_REQUEST_INVALID" });
          return true;
        }
        const verification = await application.capabilities.execute("verification.get", { id }, signal);
        if (!verification) {
          sendJson(response, 404, { error: "CAD_VERIFICATION_UNKNOWN" });
        } else {
          sendJson(response, 200, { verification: parseCadOutputVerification(verification) });
        }
        return true;
      }
      return false;
    }
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new Error("EXPORT_REQUEST_TOO_LARGE");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}
