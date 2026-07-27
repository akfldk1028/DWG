import type { CadIndex } from "../types";
import { getJson } from "./httpClient";

export function loadDrawingIndex(signal?: AbortSignal) {
  return getJson<CadIndex>("/data/export_sample.index.json", signal);
}
