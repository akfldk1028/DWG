import assert from "node:assert/strict";
import test from "node:test";

import type { CadEditBatch } from "@dwg/contracts";
import type { CadDocumentSnapshot } from "@dwg/cad-document";
import { createCadEditHistory } from "@dwg/cad-edit";

import { createEditCapabilityComposition } from "@dwg/cad-capabilities";

function snapshot(): CadDocumentSnapshot {
  return {
    documentId: "drawing:capabilities",
    revision: 0,
    sourceSha256: "A".repeat(64),
    drawingVersion: "AC1032",
    units: "Millimeters",
    index: {
      schemaVersion: "cad-index/v0.2",
      drawingId: "drawing:capabilities",
      source: { kind: "dxf", displayName: "capabilities.dxf", parser: "fixture" },
      summary: { entityCount: 1, layerCount: 1, unsupportedCount: 0, modelSpaceCount: 1, paperSpaceCount: 0 },
      drawing: { fileVersion: "AC1032", units: "Millimeters" },
      layers: [{ name: "0", entityCount: 1, visible: true, frozen: false, color: 7, locked: false }],
      unsupported: [],
      entities: [{
        id: "h:10", handle: "10", type: "TEXT", layer: "0", space: "model", layout: "Model",
        bbox: { min: [0, 0, 0], max: [0, 0, 0] }, text: "original", blockName: null,
        attributes: {}, warnings: [],
        geometry: { kind: "text", insertionPoint: [0, 0, 0], alignmentPoint: null, height: 1, rotation: 0, width: null }
      }]
    },
    layers: [{ id: "layer:imported:MA", name: "0", color: 7, visible: true, frozen: false, locked: false }]
  };
}

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function batch(revision: number, index: number, text = `text-${index}`): CadEditBatch {
  return {
    schemaVersion: "cad-edit/v1",
    transactionId: uuid(index),
    documentId: "drawing:capabilities",
    expectedRevision: revision,
    commands: [{
      commandId: uuid(1000 + index),
      expectedRevision: revision,
      origin: { kind: "user", id: "user:local" },
      preconditions: [{ target: "10", field: "exists", equals: true }],
      operation: { kind: "text.replace", handle: "10", text }
    }]
  };
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

async function preview(
  composition: ReturnType<typeof createEditCapabilityComposition>,
  revision: number,
  index: number
) {
  return composition.module.execute("edit.preview", { batch: batch(revision, index) }) as Promise<{
    previewId: string;
    documentId: string;
    transactionId: string;
    baseRevision: number;
    nextRevision: number;
    changes: unknown[];
    warnings: string[];
  }>;
}

test("edit preview exposes a bounded review summary without a document snapshot", async () => {
  const composition = createEditCapabilityComposition(createCadEditHistory(snapshot()));
  const result = await preview(composition, 0, 1);

  assert.match(result.previewId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(
    Object.keys(result).sort(),
    ["baseRevision", "changes", "documentId", "nextRevision", "previewId", "transactionId", "warnings"]
  );
  assert.equal(result.baseRevision, 0);
  assert.equal(result.nextRevision, 1);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.warnings, []);
});

test("edit apply consumes an approved preview once and shares its history transaction store", async () => {
  const history = createCadEditHistory(snapshot());
  const composition = createEditCapabilityComposition(history);
  const proposed = await preview(composition, 0, 2);

  const applied = await composition.module.execute("edit.apply", {
    previewId: proposed.previewId,
    documentId: "drawing:capabilities",
    expectedRevision: 0,
    approved: true
  }) as { documentId: string; revision: number; transactionId: string; changeCount: number };

  assert.deepEqual(applied, {
    documentId: "drawing:capabilities", revision: 1, transactionId: uuid(2), changeCount: 1
  });
  assert.equal(composition.transactions.getCommittedTransaction(uuid(2))?.status, "applied");
  assert.equal(history.current().revision, 1);
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: proposed.previewId, documentId: "drawing:capabilities", expectedRevision: 1, approved: true
    }),
    (error) => codeOf(error) === "EDIT_PREVIEW_REUSED"
  );
});

test("edit approval requests remain strict and do not commit arbitrary input", async () => {
  const history = createCadEditHistory(snapshot());
  const composition = createEditCapabilityComposition(history);
  const proposed = await preview(composition, 0, 50);

  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: proposed.previewId,
      documentId: "drawing:capabilities",
      expectedRevision: 0,
      approved: true,
      ignored: "untrusted"
    })
  );
  assert.equal(history.current().revision, 0);

  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: proposed.previewId,
      documentId: "drawing:capabilities",
      expectedRevision: 0,
      approved: false,
      ignored: "cannot reject another caller's preview"
    })
  );
  assert.equal(history.current().revision, 0);
  assert.equal((await composition.module.execute("edit.apply", {
    previewId: proposed.previewId,
    documentId: "drawing:capabilities",
    expectedRevision: 0,
    approved: true
  }) as { revision: number }).revision, 1);
});

test("edit apply denies unknown, cross-document, rejected, and stale previews with distinct lifecycle errors", async () => {
  const composition = createEditCapabilityComposition(createCadEditHistory(snapshot()));
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: uuid(99), documentId: "drawing:capabilities", expectedRevision: 0, approved: true
    }),
    (error) => codeOf(error) === "EDIT_PREVIEW_UNKNOWN"
  );

  const crossDocument = await preview(composition, 0, 3);
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: crossDocument.previewId, documentId: "drawing:other", expectedRevision: 0, approved: true
    }),
    (error) => codeOf(error) === "EDIT_DOCUMENT_MISMATCH"
  );
  assert.equal((await composition.module.execute("edit.apply", {
    previewId: crossDocument.previewId, documentId: "drawing:capabilities", expectedRevision: 0, approved: true
  }) as { revision: number }).revision, 1);

  const rejected = await preview(composition, 1, 4);
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: rejected.previewId, documentId: "drawing:capabilities", expectedRevision: 1, approved: false
    }),
    (error) => codeOf(error) === "EDIT_APPROVAL_REQUIRED"
  );
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: rejected.previewId, documentId: "drawing:capabilities", expectedRevision: 1, approved: true
    }),
    (error) => codeOf(error) === "EDIT_PREVIEW_REJECTED"
  );

  const stale = await preview(composition, 1, 5);
  const fresh = await preview(composition, 1, 6);
  await composition.module.execute("edit.apply", {
    previewId: fresh.previewId, documentId: "drawing:capabilities", expectedRevision: 1, approved: true
  });
  await assert.rejects(
    () => composition.module.execute("edit.apply", {
      previewId: stale.previewId, documentId: "drawing:capabilities", expectedRevision: 1, approved: true
    }),
    (error) => codeOf(error) === "EDIT_PREVIEW_STALE"
  );
});

test("edit undo and redo operate on the paired history and require the current document revision", async () => {
  const history = createCadEditHistory(snapshot());
  const composition = createEditCapabilityComposition(history);
  const proposed = await preview(composition, 0, 7);
  await composition.module.execute("edit.apply", {
    previewId: proposed.previewId, documentId: "drawing:capabilities", expectedRevision: 0, approved: true
  });

  const undone = await composition.module.execute("edit.undo", {
    documentId: "drawing:capabilities", expectedRevision: 1, approved: true
  }) as { revision: number };
  const redone = await composition.module.execute("edit.redo", {
    documentId: "drawing:capabilities", expectedRevision: 2, approved: true
  }) as { revision: number };

  assert.deepEqual([undone.revision, redone.revision, composition.transactions.getCommittedTransaction(uuid(7))?.status], [2, 3, "applied"]);
  assert.equal(composition.transactions.getSaveState("drawing:capabilities", 3)?.current.revision, 3);
  await assert.rejects(
    () => composition.module.execute("edit.undo", {
      documentId: "drawing:capabilities", expectedRevision: 2, approved: true
    }),
    (error) => codeOf(error) === "EDIT_REVISION_CONFLICT"
  );
});

test("edit previews expire after ten minutes and retain at most twenty active previews per document", async () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const composition = createEditCapabilityComposition(createCadEditHistory(snapshot()));
    const expiring = await preview(composition, 0, 8);
    now += 10 * 60 * 1000;
    await assert.rejects(
      () => composition.module.execute("edit.apply", {
        previewId: expiring.previewId, documentId: "drawing:capabilities", expectedRevision: 0, approved: true
      }),
      (error) => codeOf(error) === "EDIT_PREVIEW_EXPIRED"
    );

    const previews = [] as Awaited<ReturnType<typeof preview>>[];
    for (let index = 0; index < 21; index += 1) previews.push(await preview(composition, 0, 20 + index));
    await assert.rejects(
      () => composition.module.execute("edit.apply", {
        previewId: previews[0]!.previewId, documentId: "drawing:capabilities", expectedRevision: 0, approved: true
      }),
      (error) => codeOf(error) === "EDIT_PREVIEW_EVICTED"
    );
    assert.equal((await composition.module.execute("edit.apply", {
      previewId: previews[20]!.previewId, documentId: "drawing:capabilities", expectedRevision: 0, approved: true
    }) as { revision: number }).revision, 1);
  } finally {
    Date.now = realNow;
  }
});
