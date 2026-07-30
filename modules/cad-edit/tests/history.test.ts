import assert from "node:assert/strict";
import test from "node:test";

import type { CadEditBatch, CadEditCommand, CadEditPrecondition } from "@dwg/contracts";
import type { CadDocumentSnapshot } from "@dwg/cad-document";
import { CadEditError, createCadEditHistory } from "../src/index.js";

const transactionIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003"
] as const;

function snapshot(revision = 0): CadDocumentSnapshot {
  return {
    documentId: "drawing:history",
    revision,
    sourceSha256: "A".repeat(64),
    drawingVersion: "AC1032",
    units: "Millimeters",
    index: {
      schemaVersion: "cad-index/v0.2",
      drawingId: "drawing:history",
      source: { kind: "dxf", displayName: "history.dxf", parser: "fixture" },
      summary: { entityCount: 3, layerCount: 1, unsupportedCount: 0, modelSpaceCount: 3, paperSpaceCount: 0 },
      drawing: { fileVersion: "AC1032", units: "Millimeters" },
      layers: [{ name: "0", entityCount: 1, visible: true, frozen: false, color: 7, locked: false }],
      unsupported: [],
      entities: [{
        id: "h:10", handle: "10", type: "TEXT", layer: "0", space: "model", layout: "Model",
        bbox: { min: [0, 0, 0], max: [0, 0, 0] }, text: "original", blockName: null,
        attributes: {}, warnings: [],
        geometry: { kind: "text", insertionPoint: [0, 0, 0], alignmentPoint: null, height: 1, rotation: 0, width: null }
      }, {
        id: "h:11", handle: "11", type: "LINE", layer: "0", space: "model", layout: "Model",
        bbox: { min: [1, 0, 0], max: [2, 0, 0] }, text: null, blockName: null,
        attributes: {}, warnings: [],
        geometry: { kind: "line", start: [1, 0, 0], end: [2, 0, 0] }
      }, {
        id: "h:12", handle: "12", type: "LINE", layer: "0", space: "model", layout: "Model",
        bbox: { min: [3, 0, 0], max: [4, 0, 0] }, text: null, blockName: null,
        attributes: {}, warnings: [],
        geometry: { kind: "line", start: [3, 0, 0], end: [4, 0, 0] }
      }]
    },
    layers: [{ id: "layer:imported:MA", name: "0", color: 7, visible: true, frozen: false, locked: false }]
  };
}

function batch(
  expectedRevision: number,
  text: string,
  transactionId: string = transactionIds[0]!,
  commandId = "10000000-0000-4000-8000-000000000001"
): CadEditBatch {
  const operation: CadEditCommand = { kind: "text.replace", handle: "10", text };
  const preconditions: CadEditPrecondition[] = [{ target: "10", field: "exists", equals: true }];
  return {
    schemaVersion: "cad-edit/v1",
    transactionId,
    documentId: "drawing:history",
    expectedRevision,
    commands: [{
      commandId,
      expectedRevision,
      origin: { kind: "user", id: "user:local" },
      preconditions,
      operation
    }]
  };
}

function textOf(value: CadDocumentSnapshot): string | null | undefined {
  return value.index.entities.find((entity) => entity.handle === "10")?.text;
}

function applyText(
  history: ReturnType<typeof createCadEditHistory>,
  text: string,
  transactionId: string,
  commandId: string
): CadDocumentSnapshot {
  const current = history.current();
  return history.apply(history.preview(batch(current.revision, text, transactionId, commandId)));
}

test("preview is repeatable and never mutates the current snapshot", () => {
  const initial = snapshot();
  const history = createCadEditHistory(initial);
  const proposal = batch(0, "preview only");

  const first = history.preview(proposal);
  const second = history.preview(proposal);

  assert.equal(textOf(first.snapshot), "preview only");
  assert.deepEqual(second, first);
  assert.equal(history.current().revision, 0);
  assert.equal(textOf(history.current()), "original");
  assert.deepEqual(initial, snapshot());
});

test("apply commits a preview exactly once and isolates stored snapshots", () => {
  const history = createCadEditHistory(snapshot());
  const preview = history.preview(batch(0, "applied"));

  const committed = history.apply(preview);
  preview.snapshot.index.entities[0]!.text = "mutated preview";
  committed.index.entities[0]!.text = "mutated return";

  assert.equal(history.current().revision, 1);
  assert.equal(textOf(history.current()), "applied");
  assert.deepEqual(history.entries(), [{
    transactionId: transactionIds[0], batch: batch(0, "applied"), beforeRevision: 0, afterRevision: 1, changeCount: 1
  }]);
  assert.throws(
    () => history.apply(preview),
    (error) => error instanceof CadEditError && error.code === "EDIT_REVISION_CONFLICT"
  );
});

test("undo and redo restore content while assigning monotonic revisions", () => {
  const history = createCadEditHistory(snapshot());
  applyText(history, "first", transactionIds[0], "10000000-0000-4000-8000-000000000001");

  const undone = history.undo(1);
  const redone = history.redo(2);

  assert.deepEqual([undone.revision, textOf(undone), redone.revision, textOf(redone)], [2, "original", 3, "first"]);
  assert.equal(history.getCommittedTransaction(transactionIds[0])?.status, "applied");
  assert.throws(
    () => history.undo(2),
    (error) => error instanceof CadEditError && error.code === "EDIT_REVISION_CONFLICT"
  );
});

test("a new apply after undo supersedes redo and stale previews cannot be committed", () => {
  const history = createCadEditHistory(snapshot());
  applyText(history, "first", transactionIds[0], "10000000-0000-4000-8000-000000000001");
  const redoPreview = history.preview(batch(1, "second", transactionIds[1], "10000000-0000-4000-8000-000000000002"));
  history.apply(redoPreview);
  history.undo(2);

  const replacement = applyText(history, "replacement", transactionIds[2], "10000000-0000-4000-8000-000000000003");

  assert.deepEqual([replacement.revision, textOf(replacement)], [4, "replacement"]);
  assert.equal(history.getCommittedTransaction(transactionIds[1])?.status, "superseded");
  assert.throws(
    () => history.redo(4),
    (error) => error instanceof CadEditError && error.code === "EDIT_REDO_UNAVAILABLE"
  );
  assert.throws(
    () => history.apply(redoPreview),
    (error) => error instanceof CadEditError && error.code === "EDIT_REVISION_CONFLICT"
  );
});

test("save state exposes only active lineage and defensive clones", () => {
  const history = createCadEditHistory(snapshot());
  applyText(history, "first", transactionIds[0], "10000000-0000-4000-8000-000000000001");
  applyText(history, "second", transactionIds[1], "10000000-0000-4000-8000-000000000002");
  history.undo(2);
  const current = applyText(history, "replacement", transactionIds[2], "10000000-0000-4000-8000-000000000003");

  const save = history.getSaveState("drawing:history", current.revision);
  assert.ok(save);
  assert.deepEqual(save.lineage.map((entry) => entry.batch.transactionId), [transactionIds[0], transactionIds[2]]);
  assert.equal(textOf(save.current), "replacement");
  save.current.index.entities[0]!.text = "outside mutation";
  save.lineage[0]!.after.index.entities[0]!.text = "outside mutation";
  assert.equal(textOf(history.current()), "replacement");
  assert.equal(textOf(history.getCommittedTransaction(transactionIds[0])!.after), "first");
  assert.equal(history.getSaveState("drawing:other", current.revision), null);
  assert.equal(history.getSaveState("drawing:history", current.revision - 1), null);
});

test("history keeps a bounded UI window while retaining the active command lineage", () => {
  const history = createCadEditHistory(snapshot());
  for (let index = 0; index < 101; index += 1) {
    applyText(
      history,
      `revision-${index}`,
      `20000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      `30000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
    );
  }

  assert.equal(history.entries().length, 100);
  assert.equal(history.entries()[0]?.beforeRevision, 1);
  assert.equal(history.getSaveState("drawing:history", 101)?.lineage.length, 101);
});

test("lineage capacity counts commands rather than resolved per-target evidence", () => {
  const history = createCadEditHistory(snapshot());
  for (let index = 0; index < 9_999; index += 1) {
    applyText(
      history,
      `revision-${index}`,
      `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      `50000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
    );
  }
  const current = history.current();
  const finalBatch: CadEditBatch = {
    schemaVersion: "cad-edit/v1",
    transactionId: "60000000-0000-4000-8000-000000000001",
    documentId: "drawing:history",
    expectedRevision: current.revision,
    commands: [{
      commandId: "70000000-0000-4000-8000-000000000001",
      expectedRevision: current.revision,
      origin: { kind: "user", id: "user:local" },
      preconditions: [
        { target: "11", field: "exists", equals: true },
        { target: "12", field: "exists", equals: true }
      ],
      operation: { kind: "entity.move", handles: ["11", "12"], delta: [1, 0, 0] }
    }]
  };

  assert.doesNotThrow(() => history.apply(history.preview(finalBatch)));
  assert.throws(
    () => history.preview(batch(10_000, "over the limit", "80000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000001")),
    (error) => error instanceof CadEditError && error.code === "EDIT_LINEAGE_LIMIT_REACHED"
  );
});

test("save state rejects a history whose source cannot begin at revision zero", () => {
  const history = createCadEditHistory(snapshot(7));
  assert.equal(history.getSaveState("drawing:history", 7), null);
});
