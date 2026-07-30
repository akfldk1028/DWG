import assert from "node:assert/strict";
import { test } from "node:test";

import type { CadEntityIndex, CadEntityIndexItem } from "@dwg/contracts";
import { compareCadDrawings } from "@dwg/cad-query";

function entity(
  id: string,
  handle: string | null,
  type = "TEXT",
  layer = "A-TEXT",
  bbox: CadEntityIndexItem["bbox"] = { min: [0, 0, 0], max: [1, 1, 0] },
  text: string | null = "ROOM"
): CadEntityIndexItem {
  return {
    id, handle, type, layer, bbox, text,
    space: "model", layout: "Model", blockName: null,
    attributes: {}, geometry: {}, warnings: []
  };
}

function index(drawingId: string, entities: CadEntityIndexItem[]): CadEntityIndex {
  return {
    schemaVersion: "cad-index/v0.1", drawingId,
    source: { kind: "dxf", displayName: `${drawingId}.dxf`, parser: "fixture" },
    summary: { entityCount: entities.length, layerCount: 1, unsupportedCount: 0, modelSpaceCount: entities.length, paperSpaceCount: 0 },
    layers: [{ name: "A-TEXT", entityCount: entities.length, visible: true, frozen: false }],
    entities, unsupported: []
  };
}

test("compareCadDrawings matches non-null handles before stable IDs and returns deterministic changes", () => {
  const comparison = compareCadDrawings(
    index("before", [
      entity("stable-handle", "10", "TEXT", "A-OLD"),
      entity("same-id", null, "TEXT", "A-TEXT"),
      entity("removed", "30"),
      entity("handle-wins", "40", "TEXT", "A-TEXT", undefined, "before")
    ]),
    index("after", [
      entity("new-stable-handle", "10", "MTEXT", "A-NEW"),
      entity("same-id", null, "TEXT", "A-TEXT", undefined, "after"),
      entity("added", "20"),
      entity("handle-wins", "99", "TEXT", "A-TEXT", undefined, "ignored")
    ])
  );

  assert.deepEqual(comparison.added.map((match) => match.id), ["added"]);
  assert.deepEqual(comparison.removed.map((match) => match.id), ["removed"]);
  assert.deepEqual(comparison.changed.map((change) => [
    change.before.id,
    change.after.id,
    change.fields
  ]), [
    ["stable-handle", "new-stable-handle", ["type", "layer"]],
    ["handle-wins", "handle-wins", ["text"]],
    ["same-id", "same-id", ["text"]]
  ]);
});

test("compareCadDrawings treats bbox differences at or below one millionth as unchanged", () => {
  const before = index("before", [entity("stable", null)]);
  const withinTolerance = index("within", [entity(
    "stable", null, "TEXT", "A-TEXT",
    { min: [0.000001, 0, 0], max: [1, 1, 0] }
  )]);
  const outsideTolerance = index("outside", [entity(
    "stable", null, "TEXT", "A-TEXT",
    { min: [0.0000011, 0, 0], max: [1, 1, 0] }
  )]);

  assert.deepEqual(compareCadDrawings(before, withinTolerance).changed, []);
  assert.deepEqual(compareCadDrawings(before, outsideTolerance).changed.map((change) => change.fields), [["bbox"]]);
});

test("compareCadDrawings distinguishes null bounding boxes and orders additions removals by stable evidence", () => {
  const comparison = compareCadDrawings(
    index("before", [
      entity("z-removed", "z"),
      entity("a-removed", null),
      entity("stable", null, "TEXT", "A-TEXT", null)
    ]),
    index("after", [
      entity("z-added", "z2"),
      entity("a-added", null),
      entity("stable", null)
    ])
  );

  assert.deepEqual(comparison.added.map((match) => match.id), ["a-added", "z-added"]);
  assert.deepEqual(comparison.removed.map((match) => match.id), ["a-removed", "z-removed"]);
  assert.deepEqual(comparison.changed.map((change) => change.fields), [["bbox"]]);
});
