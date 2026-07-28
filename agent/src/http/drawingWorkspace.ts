import { existsSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

import type {
  CadEntityIndex,
  InspectionCheck,
  InspectionRun
} from "@dwg/contracts";

import { buildCadIndexForPath } from "../application/cad-tools/runtime.js";
import { createInspectionOrchestrator } from "../orchestration/orchestrator.js";

export interface DrawingWorkspace {
  getIndex(): Promise<CadEntityIndex>;
  inspect(checks: readonly InspectionCheck[]): Promise<InspectionRun>;
}

export function createDrawingWorkspace(
  workspaceRoot: string,
  configuredPath: string
): DrawingWorkspace {
  const drawingPath = resolveWorkspaceDrawingPath(workspaceRoot, configuredPath);
  if (!existsSync(drawingPath)) {
    throw new Error(`Drawing not found: ${configuredPath}`);
  }

  const orchestrator = createInspectionOrchestrator();
  return {
    getIndex: () => buildCadIndexForPath(drawingPath),
    inspect: (checks) => orchestrator.run({ path: drawingPath, checks })
  };
}

export function resolveWorkspaceDrawingPath(
  workspaceRoot: string,
  configuredPath: string
) {
  const root = resolve(workspaceRoot);
  const drawingPath = resolve(root, configuredPath);
  const relativePath = relative(root, drawingPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Drawing path is outside workspace");
  }

  const extension = extname(drawingPath).toLowerCase();
  if (extension !== ".dwg" && extension !== ".dxf") {
    throw new Error(`Unsupported drawing format: ${extension || "(none)"}`);
  }
  return drawingPath;
}
