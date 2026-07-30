import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createCadMcpServer } from "../../src/mcp/createServer.js";
import { createCadApplication } from "../../src/application/createCadApplication.js";
import { CAD_TOOL_NAMES } from "../../src/mcp/toolDefinitions.js";

test("lists the complete deterministic CAD tool surface", async (t) => {
  const application = await createCadApplication();
  const server = createCadMcpServer(application.capabilities);
  const client = new Client({ name: "cad-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.listTools();

  assert.deepEqual(
    result.tools.map((tool) => tool.name).sort(),
    [...CAD_TOOL_NAMES].sort()
  );
});

test("runs the complete indexed DXF query loop through MCP", async (t) => {
  const application = await createCadApplication();
  const server = createCadMcpServer(application.capabilities);
  const client = new Client({ name: "cad-loop-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const opened = await client.callTool({
    name: "cad.open_drawing",
    arguments: { path: "tests/fixtures/dxf/minimal-architectural.dxf" }
  });
  const drawingId = (
    opened.structuredContent as { drawingId: string }
  ).drawingId;

  const built = await client.callTool({
    name: "cad.build_index",
    arguments: { drawingId }
  });
  assert.equal(
    (built.structuredContent as { drawingId: string }).drawingId,
    drawingId
  );

  const layers = await client.callTool({
    name: "cad.get_layers",
    arguments: { drawingId }
  });
  assert.ok(
    (layers.structuredContent as { layers: Array<{ name: string }> }).layers
      .some((layer) => layer.name === "A-WALL")
  );

  const byLayer = await client.callTool({
    name: "cad.find_entities_by_layer",
    arguments: { drawingId, layer: "A-WALL" }
  });
  const layerMatches = (
    byLayer.structuredContent as { matches: Array<Record<string, unknown>> }
  ).matches;
  assert.equal(layerMatches.length, 2);
  for (const match of layerMatches) {
    for (const field of ["id", "handle", "type", "layer", "bbox"]) {
      assert.ok(match[field], `missing ${field}`);
    }
  }

  const byType = await client.callTool({
    name: "cad.find_entities_by_type",
    arguments: { drawingId, type: "line" }
  });
  assert.equal(
    (byType.structuredContent as { matches: unknown[] }).matches.length,
    1
  );

  const byText = await client.callTool({
    name: "cad.find_text",
    arguments: { drawingId, query: "ROOM" }
  });
  assert.equal(
    (
      byText.structuredContent as {
        matches: Array<{ text: string }>;
      }
    ).matches[0].text,
    "ROOM 101"
  );

  const entity = await client.callTool({
    name: "cad.get_entity",
    arguments: { drawingId, entityIdOrHandle: "10" }
  });
  assert.equal(
    (entity.structuredContent as { entity: { handle: string } }).entity.handle,
    "10"
  );

  const unsupported = await client.callTool({
    name: "cad.list_unsupported",
    arguments: { drawingId }
  });
  assert.ok(
    Array.isArray(
      (unsupported.structuredContent as { unsupported: unknown[] }).unsupported
    )
  );
});

test("official DXF capability results preserve MCP drawing IDs and read summaries", async (t) => {
  const application = await createCadApplication();
  const runtime = application.capabilities;
  const server = createCadMcpServer(runtime);
  const client = new Client({ name: "capability-parity-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const capabilityOpen = await runtime.execute("document.open", {
    path: "tests/fixtures/dxf/minimal-architectural.dxf"
  }) as { drawingId: string };
  const mcpOpen = await client.callTool({
    name: "cad.open_drawing",
    arguments: { path: "tests/fixtures/dxf/minimal-architectural.dxf" }
  });
  const drawingId = (mcpOpen.structuredContent as { drawingId: string }).drawingId;
  assert.equal(capabilityOpen.drawingId, drawingId);

  const capabilityLayers = await runtime.execute("query.layers", {
    drawingId: capabilityOpen.drawingId
  }) as { layers: unknown[] };
  const mcpLayers = await client.callTool({
    name: "cad.get_layers",
    arguments: { drawingId }
  });
  assert.equal(
    capabilityLayers.layers.length,
    (mcpLayers.structuredContent as { layers: unknown[] }).layers.length
  );

  const capabilityText = await runtime.execute("query.text", {
    drawingId: capabilityOpen.drawingId,
    query: "ROOM"
  }) as { matches: Array<{ handle: string | null }> };
  const mcpText = await client.callTool({
    name: "cad.find_text",
    arguments: { drawingId, query: "ROOM" }
  });
  assert.deepEqual(
    capabilityText.matches.map((match) => match.handle),
    (mcpText.structuredContent as { matches: Array<{ handle: string | null }> })
      .matches.map((match) => match.handle)
  );

  const capabilityDescription = await runtime.execute("document.describe", {
    drawingId: capabilityOpen.drawingId
  }) as { unsupported: unknown[] };
  const mcpUnsupported = await client.callTool({
    name: "cad.list_unsupported",
    arguments: { drawingId }
  });
  assert.deepEqual(
    capabilityDescription.unsupported,
    (mcpUnsupported.structuredContent as { unsupported: unknown[] }).unsupported
  );
});

test("returns a stable structured MCP error for an unknown drawing", async (t) => {
  const application = await createCadApplication();
  const server = createCadMcpServer(application.capabilities);
  const client = new Client({ name: "cad-error-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "cad.get_layers",
    arguments: { drawingId: "missing-drawing" }
  });

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    error: {
      code: "CAD_TOOL_ERROR",
      message: "Drawing not opened: missing-drawing"
    }
  });
});
