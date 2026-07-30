import { useEffect, useState } from "react";

import type { ExportCapabilitiesResponse } from "@dwg/contracts";

import { loadExportCapabilities } from "../../shared/api/exportClient";

export function useExport() {
  const [capabilities, setCapabilities] = useState<ExportCapabilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadExportCapabilities(controller.signal).then(
      (response) => setCapabilities(response),
      (reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Export capabilities are unavailable.");
      }
    );
    return () => controller.abort();
  }, []);

  return { capabilities, error };
}
