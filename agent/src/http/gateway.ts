import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { buildCadIndexForPath } from "../application/cad-tools/runtime.js";
import { createChatService } from "../application/chat/chatService.js";
import { createProviderRegistry, getProviderStatuses } from "../providers/providerRegistry.js";
import { createProviderGateway } from "./providerGateway.js";

const workspace = resolve(process.env.DWG_WORKSPACE ?? process.cwd());
const providers = createProviderRegistry(workspace);
const chatService = createChatService({
  providers,
  async loadIndex(path) {
    const fullPath = resolve(workspace, path);
    if (!existsSync(fullPath)) throw new Error(`Drawing not found: ${path}`);
    return buildCadIndexForPath(fullPath);
  }
});

const server = createProviderGateway({
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
