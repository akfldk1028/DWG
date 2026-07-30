import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  composeCadCapabilityModules,
  createEditCapabilityComposition,
  createReadCapabilityModule,
  type CadCapabilityRuntime,
  type ReadCapabilityDependencies
} from "@dwg/cad-capabilities";
import { createDocumentSnapshot } from "@dwg/cad-document";
import { createCadEditHistory, type CadCommittedTransactionStore } from "@dwg/cad-edit";
import type { CadEntityIndex } from "@dwg/contracts";

import { buildIndexFromDxfFileName } from "../parsers/dxf/dxfIndexer.js";
import { buildIndexFromDwgFile } from "../parsers/dwg/acadSharpIndexer.js";
import { resolveWorkspaceCadPath } from "./drawing-access/workspacePath.js";

export const CAD_APPLICATION_CAPABILITY_NAMES = [
  "document.open",
  "document.describe",
  "query.layers",
  "query.entities",
  "query.text",
  "edit.preview",
  "edit.apply",
  "edit.undo",
  "edit.redo"
] as const;

export interface CadApplication {
  capabilities: CadCapabilityRuntime;
  transactions: CadCommittedTransactionStore;
  capabilityNames: readonly (typeof CAD_APPLICATION_CAPABILITY_NAMES)[number][];
  /** Returns the immutable source-derived index with the active edit snapshot applied. */
  currentIndex(): CadEntityIndex;
  /** Opens a drawing through the application read port, preserving the active snapshot. */
  readIndex(path: string, signal?: AbortSignal): Promise<CadEntityIndex>;
}

export interface CadApplicationOptions {
  workspaceRoot?: string;
  drawingPath?: string;
  loadInitialIndex?: (signal?: AbortSignal) => Promise<CadEntityIndex>;
  read?: ReadCapabilityDependencies;
  sourceSha256?: string;
}

export async function createCadApplication(
  options: CadApplicationOptions = {}
): Promise<CadApplication> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const initialIndex = await (options.loadInitialIndex
    ? options.loadInitialIndex()
    : options.drawingPath
      ? loadDefaultIndex(workspaceRoot, options.drawingPath)
      : createUnopenedIndex());
  const sourceSha256 = options.sourceSha256 ?? createHash("sha256")
    .update(JSON.stringify(initialIndex))
    .digest("hex");
  const history = createCadEditHistory(createDocumentSnapshot(initialIndex, sourceSha256));
  const edit = createEditCapabilityComposition(history);
  const currentIndex = () => projectCurrentIndex(history.current());
  const read = createCurrentReadDependencies(
    options.read ?? createDefaultReadDependencies(workspaceRoot),
    initialIndex.drawingId,
    currentIndex,
    options.drawingPath
      ? resolveWorkspaceCadPath(workspaceRoot, options.drawingPath)
      : null,
    workspaceRoot
  );

  return {
    capabilities: composeCadCapabilityModules([
      createReadCapabilityModule(read),
      edit.module
    ]),
    transactions: edit.transactions,
    capabilityNames: CAD_APPLICATION_CAPABILITY_NAMES,
    currentIndex,
    readIndex: (path, signal) => read.open(path, signal)
  };
}

function projectCurrentIndex(
  current: ReturnType<ReturnType<typeof createCadEditHistory>["current"]>
): CadEntityIndex {
  return {
    ...current.index,
    drawing: {
      fileVersion: current.drawingVersion,
      units: current.units,
      revision: current.revision
    }
  };
}

function createCurrentReadDependencies(
  source: ReadCapabilityDependencies,
  activeDrawingId: string,
  currentIndex: () => CadEntityIndex,
  activePath: string | null,
  workspaceRoot: string
): ReadCapabilityDependencies {
  return {
    async open(path, signal) {
      if (signal?.aborted) throw signal.reason;
      if (activePath !== null && resolveWorkspaceCadPath(workspaceRoot, path) === activePath) {
        return currentIndex();
      }
      const opened = await source.open(path, signal);
      return opened.drawingId === activeDrawingId ? currentIndex() : opened;
    },
    get(drawingId) {
      return drawingId === activeDrawingId ? currentIndex() : source.get(drawingId);
    }
  };
}

function createDefaultReadDependencies(workspaceRoot: string): ReadCapabilityDependencies {
  const drawings = new Map<string, CadEntityIndex>();
  return {
    async open(path, signal) {
      const fullPath = resolveWorkspaceCadPath(workspaceRoot, path);
      const index = await buildIndexForPath(fullPath, signal);
      drawings.set(index.drawingId, index);
      return index;
    },
    get(drawingId) {
      return drawings.get(drawingId) ?? null;
    }
  };
}

async function loadDefaultIndex(workspaceRoot: string, drawingPath?: string): Promise<CadEntityIndex> {
  if (!drawingPath) throw new Error("CadApplication requires a drawing path.");
  return buildIndexForPath(resolveWorkspaceCadPath(workspaceRoot, drawingPath));
}

function createUnopenedIndex(): CadEntityIndex {
  return {
    schemaVersion: "cad-index/v0.1",
    drawingId: "cad:unopened",
    source: { kind: "dxf", displayName: "unopened.dxf", parser: "application" },
    summary: {
      entityCount: 0,
      layerCount: 0,
      unsupportedCount: 0,
      modelSpaceCount: 0,
      paperSpaceCount: 0
    },
    layers: [],
    entities: [],
    unsupported: []
  };
}

async function buildIndexForPath(path: string, signal?: AbortSignal): Promise<CadEntityIndex> {
  if (signal?.aborted) throw signal.reason;
  switch (extname(path).toLowerCase()) {
    case ".dwg": return buildIndexFromDwgFile(path);
    case ".dxf": return buildIndexFromDxfFileName(await readFile(path, "utf8"), path);
    default: throw new Error(`Unsupported drawing format: ${extname(path).toLowerCase() || "(none)"}`);
  }
}
