import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  CAD_APPLICATION_CAPABILITY_NAMES,
  createCadApplication
} from "../../src/application/createCadApplication.js";
import { createCadToolRuntime } from "../../src/application/cad-tools/runtime.js";
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

  const cadTools = createCadToolRuntime(application.capabilities);
  assert.deepEqual(await cadTools.call("cad.get_layers", {
    drawingId: index.drawingId
  }), { layers: index.layers });

  assert.equal(
    createCadMcpServer.length,
    1,
    "MCP server must require the root-composed capability runtime"
  );
  const server = createCadMcpServer(application.capabilities);
  const client = new Client({ name: "cad-application-composition", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  context.after(async () => {
    await client.close();
    await server.close();
  });
  const mcpTools = await client.listTools();
  assert.deepEqual(mcpTools.tools.map((tool) => tool.name).sort(), [...CAD_TOOL_NAMES].sort());
});

test("read capabilities resolve the active edit snapshot after apply undo and redo", async () => {
  const index = editableIndex();
  const application = await createCadApplication({
    loadInitialIndex: async () => index,
    read: {
      open: async () => index,
      get: () => index
    },
    sourceSha256: "a".repeat(64)
  });

  const preview = await application.capabilities.execute("edit.preview", {
    batch: moveBatch(0)
  }) as { previewId: string };
  await application.capabilities.execute("edit.apply", {
    previewId: preview.previewId,
    documentId: index.drawingId,
    expectedRevision: 0,
    approved: true
  });
  await application.capabilities.execute("document.open", { path: "fixture.dxf" });
  assert.deepEqual(await queriedBox(application, index.drawingId), {
    min: [5, 0, 0],
    max: [6, 1, 0]
  });
  assert.deepEqual(
    (await application.readIndex("fixture.dxf")).entities[0]?.bbox,
    { min: [5, 0, 0], max: [6, 1, 0] }
  );
  assert.equal(application.currentIndex().drawing?.revision, 1);

  await application.capabilities.execute("edit.undo", {
    documentId: index.drawingId,
    expectedRevision: 1,
    approved: true
  });
  assert.deepEqual(await queriedBox(application, index.drawingId), {
    min: [0, 0, 0],
    max: [1, 1, 0]
  });
  assert.equal(application.currentIndex().drawing?.revision, 2);

  await application.capabilities.execute("edit.redo", {
    documentId: index.drawingId,
    expectedRevision: 2,
    approved: true
  });
  assert.deepEqual(await queriedBox(application, index.drawingId), {
    min: [5, 0, 0],
    max: [6, 1, 0]
  });
  assert.equal(application.currentIndex().drawing?.revision, 3);
});

test("application read port serves its configured drawing without reopening the source", async () => {
  let sourceOpenCount = 0;
  const application = await createCadApplication({
    workspaceRoot: process.cwd(),
    drawingPath: "tests/fixtures/dwg/export_sample.dwg",
    loadInitialIndex: async () => editableIndex(),
    read: {
      async open() {
        sourceOpenCount += 1;
        throw new Error("configured source must not be reopened");
      },
      get: () => null
    },
    sourceSha256: "a".repeat(64)
  });

  const current = await application.readIndex("tests/fixtures/dwg/export_sample.dwg");
  assert.equal(current.drawingId, "dwg:composition");
  assert.equal(current.drawing?.revision, 0);
  assert.equal(sourceOpenCount, 0);
});

async function queriedBox(
  application: Awaited<ReturnType<typeof createCadApplication>>,
  drawingId: string
) {
  const result = await application.capabilities.execute("query.entities", {
    drawingId,
    entityIdOrHandle: "10"
  }) as { entity: { bbox: unknown } };
  return result.entity.bbox;
}

function moveBatch(expectedRevision: number) {
  return {
    schemaVersion: "cad-edit/v1",
    transactionId: "44444444-4444-4444-8444-444444444444",
    documentId: "dwg:composition",
    expectedRevision,
    commands: [{
      commandId: "55555555-5555-4555-8555-555555555555",
      expectedRevision,
      origin: { kind: "user", id: "test" },
      preconditions: [{ target: "10", field: "exists", equals: true }],
      operation: { kind: "entity.move", handles: ["10"], delta: [5, 0, 0] }
    }]
  };
}

function editableIndex() {
  return {
    ...fakeIndex(),
    schemaVersion: "cad-index/v0.2" as const,
    summary: {
      entityCount: 1,
      layerCount: 1,
      unsupportedCount: 0,
      modelSpaceCount: 1,
      paperSpaceCount: 0
    },
    layers: [{ name: "0", entityCount: 1, visible: true, frozen: false }],
    entities: [{
      id: "h:10",
      handle: "10",
      type: "LINE",
      layer: "0",
      space: "model" as const,
      layout: "Model",
      bbox: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      text: null,
      blockName: null,
      attributes: {},
      geometry: {
        kind: "line" as const,
        start: [0, 0, 0] as [number, number, number],
        end: [1, 1, 0] as [number, number, number]
      },
      warnings: []
    }]
  };
}

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
