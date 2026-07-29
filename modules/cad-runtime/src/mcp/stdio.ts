import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";

import { createCadToolRuntime } from "../application/cad-tools/runtime.js";
import { createCadMcpServer } from "./createServer.js";

const server = createCadMcpServer(
  createCadToolRuntime({
    workspaceRoot: resolve(process.env.DWG_WORKSPACE ?? process.cwd())
  })
);
await server.connect(new StdioServerTransport());
