import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { createCadToolRuntime } from "../../src/application/cad-tools/runtime.js";

const fixture = resolve("tests/fixtures/dwg/export_sample.dwg");

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

test("opens and indexes a real DWG without modifying the source", async () => {
  const runtime = createCadToolRuntime();
  const before = await sha256(fixture);

  const opened = await runtime.call("cad.open_drawing", { path: fixture });
  const built = await runtime.call("cad.build_index", {
    drawingId: opened.drawingId
  });

  assert.equal(opened.source.kind, "dwg");
  assert.ok(built.summary.entityCount > 0);
  assert.equal(await sha256(fixture), before);
});

test("rejects unsupported drawing formats before reading them", async () => {
  const runtime = createCadToolRuntime();
  await assert.rejects(
    runtime.call("cad.open_drawing", { path: "missing.pdf" }),
    /Unsupported drawing format: \.pdf/
  );
});
