import { useEffect, useState } from "react";

import type {
  DestinationGrantResponse,
  ExportCapabilitiesResponse,
  ReportFormat,
  DrawingFormat
} from "@dwg/contracts";

import { loadDrawingIndex } from "../../shared/api/drawingIndexClient";
import {
  exportDrawing,
  exportReport,
  loadExportCapabilities,
  reportDownloadUrl,
  requestExportDestination
} from "../../shared/api/exportClient";

export function commitExportCapabilitiesIfActive(
  signal: AbortSignal,
  response: ExportCapabilitiesResponse,
  commit: (response: ExportCapabilitiesResponse) => void
) {
  if (!signal.aborted) commit(response);
}

export function useExport() {
  const [capabilities, setCapabilities] = useState<ExportCapabilitiesResponse | null>(null);
  const [destination, setDestination] = useState<DestinationGrantResponse | null>(null);
  const [baseFilename, setBaseFilename] = useState("drawing-copy");
  const [status, setStatus] = useState("Destination required");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadExportCapabilities(controller.signal).then(
      (response) => commitExportCapabilitiesIfActive(controller.signal, response, setCapabilities),
      fail
    );
    return () => controller.abort();
  }, []);

  const chooseDestination = async () => {
    try {
      const grant = await requestExportDestination();
      setDestination(grant);
      setStatus(`Destination selected: ${grant.displayDirectory}`);
      setError(null);
    } catch (reason) {
      fail(reason);
    }
  };
  const saveDrawing = async (format: DrawingFormat) => {
    if (!destination) {
      setStatus("Destination required");
      return;
    }
    try {
      const drawing = await loadDrawingIndex();
      const metadata = drawing.schemaVersion === "cad-index/v0.2" ? drawing.drawing : undefined;
      const result = await exportDrawing({
        documentId: drawing.drawingId,
        expectedRevision: metadata?.revision ?? 0,
        destinationGrantId: destination.grantId,
        baseFilename,
        format,
        version: metadata?.fileVersion ?? "AC1032"
      });
      setDestination(null);
      setStatus(result.status === "passed" ? `Verified: ${result.verificationId}` : "Verification failed");
      setError(null);
    } catch (reason) {
      fail(reason);
    }
  };
  const downloadReport = async (format: ReportFormat) => {
    try {
      const drawing = await loadDrawingIndex();
      const metadata = drawing.schemaVersion === "cad-index/v0.2" ? drawing.drawing : undefined;
      const report = await exportReport({
        documentId: drawing.drawingId,
        revision: metadata?.revision ?? 0,
        format
      });
      const anchor = document.createElement("a");
      anchor.href = reportDownloadUrl(report.downloadId);
      anchor.download = report.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setStatus(`Report ready: ${report.filename}`);
      setError(null);
    } catch (reason) {
      fail(reason);
    }
  };
  function fail(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Export failed.");
  }

  return {
    capabilities,
    destination,
    baseFilename,
    setBaseFilename,
    status,
    error,
    chooseDestination,
    saveDrawing,
    downloadReport
  };
}
