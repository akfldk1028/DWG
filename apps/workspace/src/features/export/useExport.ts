import { useEffect, useState } from "react";

import type { ExportCapabilitiesResponse } from "@dwg/contracts";

import { loadExportCapabilities } from "../../shared/api/exportClient";

export function commitExportCapabilitiesIfActive(
  signal: AbortSignal,
  response: ExportCapabilitiesResponse,
  commit: (response: ExportCapabilitiesResponse) => void
) {
  if (!signal.aborted) commit(response);
}

export function useExport() {
  const [capabilities, setCapabilities] = useState<ExportCapabilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadExportCapabilities(controller.signal).then(
      (response) => commitExportCapabilitiesIfActive(
        controller.signal,
        response,
        setCapabilities
      ),
      (reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Export capabilities are unavailable.");
      }
    );
    return () => controller.abort();
  }, []);

  return { capabilities, error };
}
