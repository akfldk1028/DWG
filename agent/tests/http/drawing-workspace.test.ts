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
