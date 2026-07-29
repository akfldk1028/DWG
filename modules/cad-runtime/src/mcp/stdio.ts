import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";

import { createCadToolRuntime } from "../application/cad-tools/runtime.js";
import { createCadMcpServer } from "./createServer.js";
import {
  createRepositoryPaths,
  findRepositoryRoot
} from "../platform/repositoryPaths.js";

const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
const server = createCadMcpServer(
  createCadToolRuntime({
    workspaceRoot: resolve(process.env.DWG_WORKSPACE ?? paths.repositoryRoot)
  })
);
await server.connect(new StdioServerTransport());
