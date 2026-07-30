import type {
  CadEntityIndex,
  InspectionCheck,
  InspectionRun
} from "@dwg/contracts";

import { buildCadIndexForPath } from "../application/cad-tools/runtime.js";
import { resolveWorkspaceCadPath } from "../application/drawing-access/workspacePath.js";
import {
  createInspectionOrchestrator,
  type OrchestrationCadRuntime
} from "../orchestration/orchestrator.js";

export { resolveWorkspaceCadPath as resolveWorkspaceDrawingPath }
  from "../application/drawing-access/workspacePath.js";

export interface DrawingWorkspace {
  getIndex(): Promise<CadEntityIndex>;
  inspect(checks: readonly InspectionCheck[]): Promise<InspectionRun>;
}

export function createDrawingWorkspace(
  workspaceRoot: string,
  configuredPath: string,
  runtime: OrchestrationCadRuntime,
  getCurrentIndex?: () => CadEntityIndex
): DrawingWorkspace {
  const drawingPath = resolveWorkspaceCadPath(workspaceRoot, configuredPath);

  const orchestrator = createInspectionOrchestrator(runtime);
  return {
    getIndex: async () => getCurrentIndex ? getCurrentIndex() : buildCadIndexForPath(drawingPath),
    inspect: (checks) => orchestrator.run({ path: drawingPath, checks })
  };
}
