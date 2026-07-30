import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CadApplication } from "../application/createCadApplication.js";
import {
  buildCadIndexForPath,
  createCadToolRuntime
} from "../application/cad-tools/runtime.js";
import { createCadApplication } from "../application/createCadApplication.js";
import { createChatService } from "../application/chat/chatService.js";
import { createProviderRegistry, getProviderStatuses } from "../providers/providerRegistry.js";
import {
  createRepositoryPaths,
  createRuntimePaths,
  findRepositoryRoot
} from "../platform/repositoryPaths.js";
import { createDrawingWorkspace, resolveWorkspaceDrawingPath } from "./drawingWorkspace.js";
import { createProviderGateway } from "./providerGateway.js";
import { createSkillGatewayRoutes } from "./skillGateway.js";

export interface CadGatewayServerOptions {
  workspaceRoot?: string;
  drawingPath?: string;
  skillRoot?: string;
  capabilityVersion?: string;
  application?: CadApplication;
}

export async function createCadGatewayServer(options: CadGatewayServerOptions = {}) {
  const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
  const runtimePaths = createRuntimePaths(paths, process.env.DWG_WORKSPACE, process.env.DWG_DRAWING_PATH);
  const workspace = options.workspaceRoot ?? runtimePaths.workspace;
  const drawingPath = options.drawingPath ?? runtimePaths.drawingPath;
  const application = options.application ?? await createCadApplication({
    workspaceRoot: workspace,
    drawingPath
  });
  const drawingWorkspace = createDrawingWorkspace(
    workspace,
    drawingPath,
    createCadToolRuntime(application.capabilities)
  );
  const providers = createProviderRegistry(workspace);
  const chatService = createChatService({
    providers,
    async loadIndex(path) {
      return buildCadIndexForPath(resolveWorkspaceDrawingPath(workspace, path));
    }
  });
  const skills = createSkillGatewayRoutes({
    skillRoot: options.skillRoot ?? resolve(paths.repositoryRoot, "skills"),
    capabilities: application.capabilities,
    capabilityVersion: options.capabilityVersion
  });

  return createProviderGateway({
    getDrawing: () => drawingWorkspace.getIndex(),
    inspect: ({ checks }) => drawingWorkspace.inspect(checks),
    getStatuses: () => getProviderStatuses(providers),
    chat: (request, signal) => chatService.chat(request, signal),
    edit: (name, input, signal) => application.capabilities.execute(name, input, signal),
    additionalRoute: (request, response, pathname, signal) => skills.handle(request, response, pathname, signal)
  });
}

if (isEntrypoint()) {
  const server = await createCadGatewayServer();
  const port = Number(process.env.DWG_GATEWAY_PORT ?? 4317);
  server.listen(port, "127.0.0.1", () => {
    console.log(`DWG provider gateway listening on http://127.0.0.1:${port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href;
}
