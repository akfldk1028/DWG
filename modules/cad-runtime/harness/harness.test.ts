import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createCadToolRuntime } from "../src/application/cad-tools/runtime.js";
import { buildIndexFromDxfText } from "../src/parsers/dxf/dxfIndexer.js";

test("builds a cad-index/v0.1 entity index from a DXF fixture", async () => {
  const dxfText = await readFile("modules/cad-runtime/fixtures/minimal-architectural.dxf", "utf8");

  const index = buildIndexFromDxfText(dxfText, {
    displayName: "minimal-architectural.dxf"
  });

  assert.equal(index.schemaVersion, "cad-index/v0.1");
  assert.equal(index.source.kind, "dxf");
  assert.ok(index.summary.entityCount >= 4);
  assert.ok(index.layers.some((layer) => layer.name === "A-WALL"));
  assert.ok(index.entities.some((entity) => entity.layer === "A-WALL" && entity.type === "LINE"));
});

test("finds layer matches with stable IDs, handles, layer, type, and bbox", async () => {
  const runtime = createCadToolRuntime();
  const opened = await runtime.call("cad.open_drawing", {
    path: "modules/cad-runtime/fixtures/minimal-architectural.dxf"
  });
  await runtime.call("cad.build_index", { drawingId: opened.drawingId });

  const result = await runtime.call("cad.find_entities_by_layer", {
    drawingId: opened.drawingId,
    layer: "A-WALL"
  });

  assert.ok(result.matches.length >= 2);
  for (const match of result.matches) {
    assert.equal(match.layer, "A-WALL");
    assert.ok(match.id);
    assert.ok(match.handle);
    assert.ok(match.type);
    assert.ok(match.bbox);
  }
});

test("keeps drawingId available after building an index for harness chaining", async () => {
  const runtime = createCadToolRuntime();
  const opened = await runtime.call("cad.open_drawing", {
    path: "modules/cad-runtime/fixtures/minimal-architectural.dxf"
  });

  const built = await runtime.call("cad.build_index", { drawingId: opened.drawingId });

  assert.equal(built.drawingId, opened.drawingId);
  assert.ok(built.indexUri.includes(opened.drawingId));
});

test("finds text matches without asking the model to inspect geometry", async () => {
  const runtime = createCadToolRuntime();
  const opened = await runtime.call("cad.open_drawing", {
    path: "modules/cad-runtime/fixtures/minimal-architectural.dxf"
  });
  await runtime.call("cad.build_index", { drawingId: opened.drawingId });

  const result = await runtime.call("cad.find_text", {
    drawingId: opened.drawingId,
    query: "ROOM"
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].text, "ROOM 101");
  assert.equal(result.matches[0].layer, "A-TEXT");
});
