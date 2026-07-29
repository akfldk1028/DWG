import type { CadPointBox } from "@dwg/contracts";

export type {
  CadEntityIndex,
  CadEntityIndexItem,
  CadIndexSource,
  CadIndexSummary,
  CadLayerIndexItem,
  CadPointBox,
  CadSourceKind,
  CadSpace,
  UnsupportedCadEntity
} from "@dwg/contracts";

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
