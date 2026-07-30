import assert from "node:assert/strict";
import test from "node:test";

import type { ExportCapabilitiesResponse } from "@dwg/contracts";
import * as exportHook from "../../src/features/export/useExport.js";

type CommitIfActive = (
  signal: AbortSignal,
  response: ExportCapabilitiesResponse,
  commit: (response: ExportCapabilitiesResponse) => void
) => void;

const response: ExportCapabilitiesResponse = { capabilities: [] };

function lifecycleGuard(): CommitIfActive {
  const candidate = (exportHook as unknown as { commitExportCapabilitiesIfActive?: unknown })
    .commitExportCapabilitiesIfActive;
  assert.equal(typeof candidate, "function");
  return candidate as CommitIfActive;
}

test("commits an export capability response while the effect is active", () => {
  let committed: ExportCapabilitiesResponse | null = null;
  lifecycleGuard()(new AbortController().signal, response, (value) => { committed = value; });
  assert.equal(committed, response);
});

test("does not commit an export capability response after effect cleanup aborts", () => {
  const controller = new AbortController();
  controller.abort();
  let commits = 0;
  lifecycleGuard()(controller.signal, response, () => { commits += 1; });
  assert.equal(commits, 0);
});
