import { resolve } from "node:path";

import { buildCadIndexForPath } from "../application/cad-tools/runtime.js";
import { createChatService } from "../application/chat/chatService.js";
import { createProviderRegistry, getProviderStatuses } from "../providers/providerRegistry.js";
import {
  createDrawingWorkspace,
  resolveWorkspaceDrawingPath
} from "./drawingWorkspace.js";
import { createProviderGateway } from "./providerGateway.js";
import {
  createRepositoryPaths,
  createRuntimePaths,
  findRepositoryRoot
} from "../platform/repositoryPaths.js";

const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
const runtimePaths = createRuntimePaths(
  paths,
  process.env.DWG_WORKSPACE,
  process.env.DWG_DRAWING_PATH
);
const workspace = runtimePaths.workspace;
const drawingWorkspace = createDrawingWorkspace(
  workspace,
  runtimePaths.drawingPath
);
const providers = createProviderRegistry(workspace);
const chatService = createChatService({
  providers,
  async loadIndex(path) {
    const fullPath = resolveWorkspaceDrawingPath(workspace, path);
    return buildCadIndexForPath(fullPath);
  }
});

const server = createProviderGateway({
  getDrawing: () => drawingWorkspace.getIndex(),
  inspect: ({ checks }) => drawingWorkspace.inspect(checks),
  getStatuses: () => getProviderStatuses(providers),
  chat: (request, signal) => chatService.chat(request, signal)
});

const port = Number(process.env.DWG_GATEWAY_PORT ?? 4317);
server.listen(port, "127.0.0.1", () => {
  console.log(`DWG provider gateway listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
