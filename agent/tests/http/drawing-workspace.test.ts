import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { createDrawingWorkspace } from "../../src/http/drawingWorkspace.js";

test("drawing workspace rejects configured paths outside its root", () => {
  const workspaceRoot = process.cwd();

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

test("drawing workspace rejects junctions that escape its canonical root", async (context) => {
  const container = await mkdtemp(resolve(tmpdir(), "dwg-workspace-"));
  context.after(() => rm(container, { recursive: true, force: true }));
  const workspaceRoot = resolve(container, "workspace");
  const outsideRoot = resolve(container, "outside");
  await mkdir(workspaceRoot);
  await mkdir(outsideRoot);
  await writeFile(resolve(outsideRoot, "secret.dwg"), "not a real drawing");
  await symlink(outsideRoot, resolve(workspaceRoot, "linked"), "junction");

  assert.throws(
    () => createDrawingWorkspace(workspaceRoot, "linked/secret.dwg"),
    /outside workspace/i
  );
});
