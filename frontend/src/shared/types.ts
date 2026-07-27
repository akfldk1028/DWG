export type Scenario = "loaded" | "running" | "highlighted" | "finding" | "warning";

export interface PointBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface CadEntity {
  id: string;
  handle: string | null;
  type: string;
  layer: string;
  bbox: PointBox | null;
  text: string | null;
  blockName: string | null;
}

export interface CadIndex {
  schemaVersion: "cad-index/v0.1";
  drawingId: string;
  source: {
    kind: "dwg";
    displayName: string;
    parser: string;
  };
  summary: {
    entityCount: number;
    layerCount: number;
    unsupportedCount: number;
  };
  layers: Array<{
    name: string;
    entityCount: number;
    visible: boolean;
    frozen: boolean;
  }>;
  entities: CadEntity[];
  unsupported: Array<{ type: string; count: number; reason: string }>;
}

export type ProviderId = "codex" | "claude";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  installed: boolean;
  authenticated: boolean;
  authMethod: "chatgpt" | "claude.ai" | "unknown";
  subscription?: string;
  detail: string;
}

export interface ProviderChatResult {
  provider: ProviderId;
  text: string;
  sessionId: string | null;
}
