import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createDrawingWorkspace } from "../../src/http/drawingWorkspace.js";

test("drawing workspace rejects configured paths outside its root", () => {
  const workspaceRoot = resolve("tests/workspace");

  assert.throws(
    () => createDrawingWorkspace(workspaceRoot, "../outside.dwg"),
    /outside workspace/i
  );
});

test("drawing workspace shares one indexed result across concurrent readers", async () => {
  const workspaceRoot = process.cwd();
  const drawingWorkspace = createDrawingWorkspace(
    workspaceRoot,
    "tests/fixtures/dwg/export_sample.dwg"
  );

  const indexes = await Promise.all(
    Array.from({ length: 5 }, () => drawingWorkspace.getIndex())
  );

  assert.equal(indexes.every((index) => index === indexes[0]), true);
});
