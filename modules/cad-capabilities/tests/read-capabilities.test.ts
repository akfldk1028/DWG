import assert from "node:assert/strict";
import { test } from "node:test";

import type { CadEntityIndex } from "@dwg/contracts";

import {
  composeCadCapabilityModules,
  createReadCapabilityModule,
  type CadCapabilityModule
} from "@dwg/cad-capabilities";

test("read capability module returns deterministic index evidence", async () => {
  const index: CadEntityIndex = {
    schemaVersion: "cad-index/v0.1",
    drawingId: "fixture-drawing",
    source: { kind: "dxf", displayName: "fixture.dxf", parser: "fixture" },
    summary: {
      entityCount: 1,
      layerCount: 1,
      unsupportedCount: 0,
      modelSpaceCount: 1,
      paperSpaceCount: 0
    },
    layers: [{ name: "A-TEXT", entityCount: 1, visible: true, frozen: false }],
    entities: [{
      id: "h:10",
      handle: "10",
      type: "TEXT",
      layer: "A-TEXT",
      space: "model",
      layout: "Model",
      bbox: { min: [0, 0, 0], max: [1, 1, 0] },
      text: "ROOM 101",
      blockName: null,
      attributes: {},
      geometry: {},
      warnings: []
    }],
    unsupported: []
  };
  const capabilities = createReadCapabilityModule({
    async open(path) {
      assert.equal(path, "fixture.dxf");
      return index;
    },
    get(drawingId) {
      return drawingId === index.drawingId ? index : null;
    }
  });

  const opened = await capabilities.execute("document.open", { path: "fixture.dxf" }) as {
    drawingId: string;
  };
  assert.equal(opened.drawingId, "fixture-drawing");

  const layers = await capabilities.execute("query.layers", {
    drawingId: opened.drawingId
  }) as { layers: Array<{ name: string }> };
  assert.deepEqual(layers.layers, index.layers);

  const text = await capabilities.execute("query.text", {
    drawingId: opened.drawingId,
    query: "ROOM"
  }) as { matches: Array<{ handle: string | null }> };
  assert.deepEqual(text.matches.map((match) => match.handle), ["10"]);

  const description = await capabilities.execute("document.describe", {
    drawingId: opened.drawingId
  }) as { unsupported: unknown[] };
  assert.deepEqual(description.unsupported, []);
});

test("composer routes through a named module with the exact AbortSignal", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const module: CadCapabilityModule = {
    names: ["query.layers"],
    async execute(name, input, signal) {
      assert.equal(name, "query.layers");
      assert.deepEqual(input, { drawingId: "fixture" });
      receivedSignal = signal;
      return { layers: [] };
    }
  };

  const runtime = composeCadCapabilityModules([module]);
  assert.deepEqual(
    await runtime.execute("query.layers", { drawingId: "fixture" }, controller.signal),
    { layers: [] }
  );
  assert.equal(receivedSignal, controller.signal);
});

test("composer rejects duplicate and unknown capability names", async () => {
  const module: CadCapabilityModule = {
    names: ["query.layers"],
    async execute() {
      return { layers: [] };
    }
  };

  assert.throws(
    () => composeCadCapabilityModules([module, module]),
    /Duplicate CAD capability name: query\.layers/
  );

  const runtime = composeCadCapabilityModules([module]);
  await assert.rejects(
    () => runtime.execute("query.text", { drawingId: "fixture", query: "ROOM" }),
    /Unknown CAD capability: query\.text/
  );
});
