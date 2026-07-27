export type CadSourceKind = "dxf" | "dwg";
export type CadSpace = "model" | "paper" | "unknown";

export interface CadPointBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface CadIndexSource {
  kind: CadSourceKind;
  displayName: string;
  parser: string;
}

export interface CadIndexSummary {
  entityCount: number;
  layerCount: number;
  unsupportedCount: number;
  modelSpaceCount: number;
  paperSpaceCount: number;
}

export interface CadLayerIndexItem {
  name: string;
  entityCount: number;
  visible: boolean;
  frozen: boolean;
}

export interface CadEntityIndexItem {
  id: string;
  handle: string | null;
  type: string;
  layer: string;
  space: CadSpace;
  layout: string;
  bbox: CadPointBox | null;
  text: string | null;
  blockName: string | null;
  attributes: Record<string, string>;
  geometry: Record<string, unknown>;
  warnings: string[];
}

export interface UnsupportedCadEntity {
  type: string;
  count: number;
  reason: string;
}

export interface CadEntityIndex {
  schemaVersion: "cad-index/v0.1";
  drawingId: string;
  source: CadIndexSource;
  summary: CadIndexSummary;
  layers: CadLayerIndexItem[];
  entities: CadEntityIndexItem[];
  unsupported: UnsupportedCadEntity[];
}

export interface CadToolMatch {
  id: string;
  handle: string | null;
  type: string;
  layer: string;
  bbox: CadPointBox | null;
  text?: string | null;
  reason: string;
  confidence: number;
}
