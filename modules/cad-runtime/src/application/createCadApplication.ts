import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  composeCadCapabilityModules,
  createDestinationGrantStore,
  createEditCapabilityComposition,
  createReadCapabilityModule,
  createSaveCapabilityModule,
  createSaveCoordinator,
  CadSaveError,
  type CadCapabilityModule,
  type CadCapabilityRuntime,
  type DestinationGrantStore,
  type ReadCapabilityDependencies
} from "@dwg/cad-capabilities";
import { exportCadReport, type CadReportChangeSet } from "@dwg/cad-export";
import {
  createAcadSharpCadIoClient,
  type CadProcessRunner
} from "@dwg/cad-io-acadsharp";
import { createDocumentSnapshot } from "@dwg/cad-document";
import { createCadEditHistory, type CadCommittedTransactionStore } from "@dwg/cad-edit";
import {
  parseCadReportExportRequest,
  type CadEntityIndex
} from "@dwg/contracts";

import {
  buildIndexForPath,
  readParsedDocumentEvidence,
  readSourceSha256
} from "./drawing-access/parsedDocumentEvidence.js";
import { createConfiguredSourceDocumentResolver } from "./drawing-access/sourceDocumentResolver.js";
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
  "edit.redo",
  "export.report",
  "export.drawing",
  "verification.get"
] as const;

export interface DestinationSelectionProvider {
  request(signal?: AbortSignal): Promise<{
    canonicalDirectory: string;
    displayDirectory: string;
  } | null>;
}

export interface CadApplicationConfig {
  workspaceRoot: string;
  drawingPath: string;
  exportRoot: string;
  dwgVersionManifestPath: string;
  processRunner: CadProcessRunner;
  destinationSelector: DestinationSelectionProvider;
  clock: () => number;
}

export interface CadApplication {
  capabilities: CadCapabilityRuntime;
  transactions: CadCommittedTransactionStore;
  capabilityNames: readonly (typeof CAD_APPLICATION_CAPABILITY_NAMES)[number][];
  /** Returns the immutable source-derived index with the active edit snapshot applied. */
  currentIndex(): CadEntityIndex;
  /** Opens a drawing through the application read port, preserving the active snapshot. */
  readIndex(path: string, signal?: AbortSignal): Promise<CadEntityIndex>;
  requestDestinationGrant(signal?: AbortSignal): Promise<{
    grantId: string;
    displayDirectory: string;
    expiresAt: number;
  } | null>;
}

export interface CadApplicationOptions {
  workspaceRoot?: string;
  drawingPath?: string;
  loadInitialIndex?: (signal?: AbortSignal) => Promise<CadEntityIndex>;
  read?: ReadCapabilityDependencies;
  sourceSha256?: string;
  exportRoot?: string;
  dwgVersionManifestPath?: string;
  processRunner?: CadProcessRunner;
  destinationSelector?: DestinationSelectionProvider;
  clock?: () => number;
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
  const activePath = options.drawingPath
    ? resolveWorkspaceCadPath(workspaceRoot, options.drawingPath)
    : null;
  const sourceSha256 = options.sourceSha256 ??
    (activePath
      ? await readSourceSha256(activePath)
      : createHash("sha256").update(JSON.stringify(initialIndex)).digest("hex"));
  const history = createCadEditHistory(createDocumentSnapshot(initialIndex, sourceSha256));
  const edit = createEditCapabilityComposition(history);
  const currentIndex = () => projectCurrentIndex(history.current());
  const read = createCurrentReadDependencies(
    options.read ?? createDefaultReadDependencies(workspaceRoot),
    initialIndex.drawingId,
    currentIndex,
    activePath,
    workspaceRoot
  );
  const clock = options.clock ?? Date.now;
  const grants = createDestinationGrantStore({ now: clock });
  const save = createSaveModule({
    history,
    grants,
    activePath,
    documentId: initialIndex.drawingId,
    processRunner: options.processRunner,
    dwgVersionManifestPath: options.dwgVersionManifestPath,
    workspaceRoot
  });

  return {
    capabilities: composeCadCapabilityModules([
      createReadCapabilityModule(read),
      edit.module,
      save
    ]),
    transactions: edit.transactions,
    capabilityNames: CAD_APPLICATION_CAPABILITY_NAMES,
    currentIndex,
    readIndex: (path, signal) => read.open(path, signal),
    async requestDestinationGrant(signal) {
      const selection = options.destinationSelector
        ? await options.destinationSelector.request(signal)
        : options.exportRoot
          ? {
              canonicalDirectory: resolve(options.exportRoot),
              displayDirectory: "Exports"
            }
          : null;
      if (!selection) return null;
      const expiresAt = clock() + 10 * 60 * 1000;
      const grantId = await grants.issue(selection.canonicalDirectory, expiresAt);
      return { grantId, displayDirectory: selection.displayDirectory, expiresAt };
    }
  };
}

function createSaveModule(options: {
  history: ReturnType<typeof createCadEditHistory>;
  grants: DestinationGrantStore;
  activePath: string | null;
  documentId: string;
  processRunner?: CadProcessRunner;
  dwgVersionManifestPath?: string;
  workspaceRoot: string;
}): CadCapabilityModule {
  let drawingModule: CadCapabilityModule | null = null;
  if (options.activePath && options.processRunner) {
    const sources = createConfiguredSourceDocumentResolver({
      documentId: options.documentId,
      configuredPath: options.activePath,
      readSha256: readSourceSha256,
      readEvidence: readParsedDocumentEvidence
    });
    const coordinator = createSaveCoordinator({
      cadIo: createAcadSharpCadIoClient({
        projectPath: resolve(
          options.workspaceRoot,
          "modules/cad-io-acadsharp/src/DwgIntelligence.CadIo.Host/DwgIntelligence.CadIo.Host.csproj"
        ),
        processRunner: options.processRunner,
        dwgVersionManifestPath: options.dwgVersionManifestPath
      }),
      sources,
      readDocument: readParsedDocumentEvidence,
      transactions: options.history,
      grants: options.grants
    });
    drawingModule = createSaveCapabilityModule(coordinator, exportCadReport);
  }

  return {
    names: ["export.report", "export.drawing", "verification.get"],
    async execute(name, input, signal) {
      if (name === "export.report") {
        const request = parseCadReportExportRequest(input);
        const state = options.history.getSaveState(request.documentId, request.revision);
        if (!state) throw new CadSaveError("CAD_SAVE_STALE");
        const changeSet: CadReportChangeSet | null = state.lineage.length === 0
          ? null
          : {
              documentId: state.documentId,
              revision: state.revision,
              transactionIds: state.lineage.map((item) => item.batch.transactionId),
              changes: state.lineage.flatMap((item) => item.changes)
            };
        return exportCadReport({
          document: state.current,
          findings: null,
          changeSet,
          verification: null
        }, request.format);
      }
      if (!drawingModule) throw new CadSaveError("CAD_SAVE_DESTINATION_UNSUPPORTED");
      return drawingModule.execute(name, input, signal);
    }
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
