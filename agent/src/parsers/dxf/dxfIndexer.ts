import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { basename } from "node:path";

import type {
  CadEntityIndex,
  CadEntityIndexItem,
  CadPointBox,
  UnsupportedCadEntity
} from "../../domain/cad-index/types.js";

const require = createRequire(import.meta.url);
const DxfParser = require("dxf-parser");

interface BuildIndexOptions {
  displayName?: string;
}

interface DxfPoint {
  x?: number;
  y?: number;
  z?: number;
}

interface DxfEntity {
  type?: string;
  handle?: string;
  layer?: string;
  vertices?: DxfPoint[];
  startPoint?: DxfPoint;
  endPoint?: DxfPoint;
  position?: DxfPoint;
  center?: DxfPoint;
  radius?: number;
  text?: string;
  name?: string;
  shape?: boolean;
}

const supportedTypes = new Set([
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "TEXT",
  "MTEXT",
  "INSERT",
  "CIRCLE",
  "ARC"
]);

export function buildIndexFromDxfText(dxfText: string, options: BuildIndexOptions = {}): CadEntityIndex {
  const parser = new DxfParser();
  const parsed = parser.parseSync(dxfText);
  const rawEntities: DxfEntity[] = Array.isArray(parsed.entities) ? parsed.entities : [];
  const entities = rawEntities.map((entity, index) => normalizeEntity(entity, index));
  const unsupported = summarizeUnsupported(rawEntities);
  const layers = buildLayers(parsed.tables?.layer?.layers ?? {}, entities);

  return {
    schemaVersion: "cad-index/v0.1",
    drawingId: createHash("sha256").update(dxfText).digest("hex").slice(0, 16),
    source: {
      kind: "dxf",
      displayName: options.displayName ?? "drawing.dxf",
      parser: "dxf-parser"
    },
    summary: {
      entityCount: entities.length,
      layerCount: layers.length,
      unsupportedCount: unsupported.reduce((sum, item) => sum + item.count, 0),
      modelSpaceCount: entities.length,
      paperSpaceCount: 0
    },
    layers,
    entities,
    unsupported
  };
}

export function buildIndexFromDxfFileName(dxfText: string, path: string): CadEntityIndex {
  return buildIndexFromDxfText(dxfText, { displayName: basename(path) });
}

function normalizeEntity(entity: DxfEntity, index: number): CadEntityIndexItem {
  const type = entity.type ?? "UNKNOWN";
  const handle = entity.handle ?? null;
  const bbox = getEntityBbox(entity);
  const warnings: string[] = [];

  if (!bbox) {
    warnings.push("bbox-unavailable");
  }
  if (!supportedTypes.has(type)) {
    warnings.push("unsupported-entity-type");
  }

  return {
    id: handle ? `h:${handle}` : `e:${index}`,
    handle,
    type,
    layer: entity.layer ?? "0",
    space: "model",
    layout: "Model",
    bbox,
    text: getEntityText(entity),
    blockName: type === "INSERT" ? entity.name ?? null : null,
    attributes: {},
    geometry: {
      closed: Boolean(entity.shape)
    },
    warnings
  };
}

function buildLayers(rawLayers: Record<string, { name?: string; visible?: boolean; frozen?: boolean }>, entities: CadEntityIndexItem[]) {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
  }

  const names = new Set([...Object.keys(rawLayers), ...counts.keys()]);
  return [...names].sort().map((name) => ({
    name,
    entityCount: counts.get(name) ?? 0,
    visible: rawLayers[name]?.visible ?? true,
    frozen: rawLayers[name]?.frozen ?? false
  }));
}

function summarizeUnsupported(entities: DxfEntity[]): UnsupportedCadEntity[] {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const type = entity.type ?? "UNKNOWN";
    if (!supportedTypes.has(type)) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([type, count]) => ({
    type,
    count,
    reason: "parser-not-supported"
  }));
}

function getEntityText(entity: DxfEntity): string | null {
  return typeof entity.text === "string" ? entity.text : null;
}

function getEntityBbox(entity: DxfEntity): CadPointBox | null {
  if (Array.isArray(entity.vertices) && entity.vertices.length > 0) {
    return bboxFromPoints(entity.vertices);
  }
  if (entity.startPoint || entity.endPoint) {
    return bboxFromPoints([entity.startPoint, entity.endPoint].filter(Boolean) as DxfPoint[]);
  }
  if (entity.position) {
    return bboxFromPoints([entity.position]);
  }
  if (entity.center && typeof entity.radius === "number") {
    const { x = 0, y = 0, z = 0 } = entity.center;
    return {
      min: [x - entity.radius, y - entity.radius, z],
      max: [x + entity.radius, y + entity.radius, z]
    };
  }
  if (entity.startPoint) {
    return bboxFromPoints([entity.startPoint]);
  }
  return null;
}

function bboxFromPoints(points: DxfPoint[]): CadPointBox | null {
  const numeric = points
    .map((point) => [point.x ?? 0, point.y ?? 0, point.z ?? 0] as [number, number, number])
    .filter(([x, y, z]) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));

  if (numeric.length === 0) {
    return null;
  }

  const min: [number, number, number] = [...numeric[0]];
  const max: [number, number, number] = [...numeric[0]];

  for (const point of numeric.slice(1)) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  }

  return { min, max };
}
