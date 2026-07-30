import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  CAD_APPLICATION_CAPABILITY_NAMES,
  createCadApplication
} from "../../src/application/createCadApplication.js";
import { createCadMcpServer } from "../../src/mcp/createServer.js";
import { CAD_TOOL_NAMES } from "../../src/mcp/toolDefinitions.js";

test("root CAD application composes one named capability set for adapters and forwards cancellation", async (context) => {
  let receivedSignal: AbortSignal | undefined;
  const index = fakeIndex();
  const application = await createCadApplication({
    loadInitialIndex: async () => index,
    read: {
      open: async (_path, signal) => {
        receivedSignal = signal;
        return index;
      },
      get: () => index
    }
  });

  assert.deepEqual(application.capabilityNames, CAD_APPLICATION_CAPABILITY_NAMES);

  const controller = new AbortController();
  await application.capabilities.execute("document.open", { path: "fixture.dxf" }, controller.signal);
  assert.equal(receivedSignal, controller.signal);

  const server = createCadMcpServer(application.capabilities);
  const client = new Client({ name: "cad-application-composition", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  context.after(async () => {
    await client.close();
    await server.close();
  });
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [...CAD_TOOL_NAMES].sort());
});

function fakeIndex() {
  return {
    schemaVersion: "cad-index/v0.1" as const,
    drawingId: "dwg:composition",
    source: { kind: "dxf" as const, displayName: "fixture.dxf", parser: "test" },
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
