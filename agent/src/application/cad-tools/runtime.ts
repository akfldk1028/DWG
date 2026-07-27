import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { buildIndexFromDxfFileName } from "../../parsers/dxf/dxfIndexer.js";
import { buildIndexFromDwgFile } from "../../parsers/dwg/acadSharpIndexer.js";
import type {
  CadEntityIndex,
  CadEntityIndexItem,
  CadToolMatch
} from "../../domain/cad-index/types.js";

type ToolArguments = Record<string, unknown>;

interface OpenedDrawing {
  path: string;
  index?: CadEntityIndex;
}

export function createCadToolRuntime() {
  const drawings = new Map<string, OpenedDrawing>();

  return {
    async call(name: string, args: ToolArguments): Promise<any> {
      switch (name) {
        case "cad.open_drawing":
          return openDrawing(args, drawings);
        case "cad.build_index":
          return buildIndex(args, drawings);
        case "cad.get_layers":
          return { layers: requireIndex(args, drawings).layers };
        case "cad.find_entities_by_layer":
          return findEntitiesByLayer(args, drawings);
        case "cad.find_entities_by_type":
          return findEntitiesByType(args, drawings);
        case "cad.find_text":
          return findText(args, drawings);
        case "cad.get_entity":
          return getEntity(args, drawings);
        case "cad.list_unsupported":
          return { unsupported: requireIndex(args, drawings).unsupported };
        default:
          throw new Error(`Unknown CAD tool: ${name}`);
      }
    }
  };
}

async function openDrawing(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const path = asString(args.path, "path");
  const fullPath = resolve(path);
  const index = await buildIndexForPath(fullPath);
  drawings.set(index.drawingId, { path: fullPath, index });

  return {
    drawingId: index.drawingId,
    source: index.source,
    warnings: index.unsupported.length > 0 ? ["unsupported-entities-present"] : []
  };
}

async function buildIndex(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const drawing = requireDrawing(args, drawings);
  if (!drawing.index) {
    drawing.index = await buildIndexForPath(drawing.path);
  }

  return {
    drawingId: drawing.index.drawingId,
    indexUri: `cad://drawings/${drawing.index.drawingId}/index`,
    summary: drawing.index.summary
  };
}

async function buildIndexForPath(path: string): Promise<CadEntityIndex> {
  const extension = extname(path).toLowerCase();
  if (extension === ".dwg") {
    return buildIndexFromDwgFile(path);
  }
  if (extension === ".dxf") {
    return buildIndexFromDxfFileName(await readFile(path, "utf8"), path);
  }
  throw new Error(`Unsupported drawing format: ${extension || "(none)"}`);
}

function findEntitiesByLayer(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const index = requireIndex(args, drawings);
  const layer = asString(args.layer, "layer");
  return {
    matches: index.entities
      .filter((entity) => entity.layer === layer)
      .map((entity) => toMatch(entity, "layer equals query"))
  };
}

function findEntitiesByType(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const index = requireIndex(args, drawings);
  const type = asString(args.type, "type").toUpperCase();
  return {
    matches: index.entities
      .filter((entity) => entity.type.toUpperCase() === type)
      .map((entity) => toMatch(entity, "type equals query"))
  };
}

function findText(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const index = requireIndex(args, drawings);
  const query = asString(args.query, "query");
  const regex = args.regex === true ? new RegExp(query, "i") : null;

  return {
    matches: index.entities
      .filter((entity) => {
        if (!entity.text) {
          return false;
        }
        return regex ? regex.test(entity.text) : entity.text.toLowerCase().includes(query.toLowerCase());
      })
      .map((entity) => ({ ...toMatch(entity, "text contains query"), text: entity.text }))
  };
}

function getEntity(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const index = requireIndex(args, drawings);
  const entityIdOrHandle = asString(args.entityIdOrHandle, "entityIdOrHandle");
  const entity = index.entities.find((item) => item.id === entityIdOrHandle || item.handle === entityIdOrHandle);
  if (!entity) {
    throw new Error(`Entity not found: ${entityIdOrHandle}`);
  }
  return { entity };
}

function requireDrawing(args: ToolArguments, drawings: Map<string, OpenedDrawing>) {
  const drawingId = asString(args.drawingId, "drawingId");
  const drawing = drawings.get(drawingId);
  if (!drawing) {
    throw new Error(`Drawing not opened: ${drawingId}`);
  }
  return drawing;
}

function requireIndex(args: ToolArguments, drawings: Map<string, OpenedDrawing>): CadEntityIndex {
  const drawing = requireDrawing(args, drawings);
  if (!drawing.index) {
    throw new Error(`Index not built for drawing: ${asString(args.drawingId, "drawingId")}`);
  }
  return drawing.index;
}

function toMatch(entity: CadEntityIndexItem, reason: string): CadToolMatch {
  return {
    id: entity.id,
    handle: entity.handle,
    type: entity.type,
    layer: entity.layer,
    bbox: entity.bbox,
    reason,
    confidence: entity.bbox ? 1 : 0.5
  };
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected string argument: ${name}`);
  }
  return value;
}
