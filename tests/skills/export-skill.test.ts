import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { parseCadSkillManifest } from "@dwg/skill-contracts";

test("export-drawing declares exact write-copy and export permissions", async () => {
  const root = resolve("skills/export-drawing");
  const manifest = parseCadSkillManifest(
    JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"))
  );
  assert.deepEqual(manifest.permissions, ["write-copy", "export"]);
  const workflow = JSON.parse(
    await readFile(resolve(root, "workflows/default.json"), "utf8")
  ) as { steps: Array<{ capability: string }> };
  assert.deepEqual(workflow.steps.map((step) => step.capability), ["export.drawing"]);
});
