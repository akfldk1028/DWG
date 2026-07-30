import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCadSkillManifest,
  type CadSkillManifest
} from "@dwg/skill-contracts";

const validManifest: CadSkillManifest = {
  id: "layer-inspection",
  version: "1.2.3",
  purpose: "Inspect drawing layers using deterministic CAD evidence.",
  capabilityContract: "cad-capabilities/v1",
  permissions: ["read"],
  capabilities: ["cad.get_layers"],
  formats: ["dwg", "dxf"],
  entityTypes: ["LAYER"],
  failureCodes: ["DRAWING_NOT_FOUND"],
  limitationCodes: ["NO_VISUAL_INFERENCE"],
  inputSchema: { type: "object", properties: {} },
  outputSchema: { type: "object", properties: {} }
};

test("parses a valid versioned CAD skill manifest", () => {
  assert.deepEqual(parseCadSkillManifest(validManifest), validManifest);
});

test("rejects a blank manifest purpose", () => {
  assertManifestRejected({ purpose: "   " });
});

test("rejects duplicate manifest permissions", () => {
  assertManifestRejected({ permissions: ["read", "read"] });
});

test("rejects path-bearing manifest IDs", () => {
  assertManifestRejected({ id: "../layer-inspection" });
  assertManifestRejected({ id: "layer/inspection" });
});

test("rejects unknown manifest permissions", () => {
  assertManifestRejected({ permissions: ["admin"] });
});

test("rejects non-semver manifest versions", () => {
  assertManifestRejected({ version: "v1.2" });
});

test("rejects malformed failure and limitation codes", () => {
  assertManifestRejected({ failureCodes: ["drawing-not-found"] });
  assertManifestRejected({ limitationCodes: ["no visual inference"] });
});

test("rejects unknown manifest properties", () => {
  assertManifestRejected({ unexpected: true });
});

function assertManifestRejected(overrides: Record<string, unknown>) {
  assert.throws(() => parseCadSkillManifest({ ...validManifest, ...overrides }));
}
