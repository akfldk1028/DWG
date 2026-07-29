import { useCallback, useEffect, useState } from "react";

export function useLayerVisibility(layerNames: readonly string[]) {
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(() => new Set());
  const layerNamesKey = layerNames.join("\u0000");

  useEffect(() => {
    const available = new Set(layerNames);
    setHiddenLayers((current) => {
      const next = new Set([...current].filter((name) => available.has(name)));
      return next.size === current.size ? current : next;
    });
  }, [layerNamesKey]);

  const toggleLayer = useCallback((layerName: string) => {
    setHiddenLayers((current) => {
      const next = new Set(current);
      if (next.has(layerName)) {
        next.delete(layerName);
      } else {
        next.add(layerName);
      }
      return next;
    });
  }, []);

  return { hiddenLayers, toggleLayer };
}
