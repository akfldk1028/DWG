import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCadMcpServer } from "./createServer.js";

const server = createCadMcpServer();
await server.connect(new StdioServerTransport());
