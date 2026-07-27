import { useEffect, useState } from "react";

import { loadDrawingIndex } from "../../shared/api/drawingIndexClient";
import type { CadIndex } from "../../shared/types";

export function useDrawingIndex() {
  const [index, setIndex] = useState<CadIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadDrawingIndex(controller.signal)
      .then(setIndex)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  return { index, error };
}
