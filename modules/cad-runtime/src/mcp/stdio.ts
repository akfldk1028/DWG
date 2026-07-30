import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";

import { createCadApplication } from "../application/createCadApplication.js";
import { createCadMcpServer } from "./createServer.js";
import {
  createRepositoryPaths,
  findRepositoryRoot
} from "../platform/repositoryPaths.js";

const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
const workspaceRoot = resolve(process.env.DWG_WORKSPACE ?? paths.repositoryRoot);
const application = await createCadApplication({
  workspaceRoot,
  drawingPath: process.env.DWG_DRAWING_PATH
});
const server = createCadMcpServer(application.capabilities);
await server.connect(new StdioServerTransport());
