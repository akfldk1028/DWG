import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCadSkillWorkflow,
  type CadSkillWorkflow,
  type CadSkillManifest
} from "@dwg/skill-contracts";
import type { CadCapabilityName, CadCapabilityRuntime } from "@dwg/cad-capabilities";

import {
  runCadSkillWorkflow,
  type InstalledCadSkill
} from "../src/index.js";

const readManifest: CadSkillManifest = {
  id: "workflow-test",
  version: "1.0.0",
  purpose: "Exercise declarative workflow execution.",
  capabilityContract: "cad-capabilities/v1",
  permissions: ["read"],
  capabilities: ["document.open", "query.layers"],
  formats: ["dwg", "dxf"],
  entityTypes: ["LAYER"],
  failureCodes: ["CAPABILITY_FAILED"],
  limitationCodes: ["NO_VISUAL_INFERENCE"],
  inputSchema: {
    type: "object",
    required: ["path"],
    properties: { path: { type: "string" } },
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    required: ["layers"],
    properties: { layers: { type: "array", items: { type: "string" } } },
    additionalProperties: false
  }
};

test("runs declared read capabilities in workflow order with safe input and step bindings", async () => {
  const calls: Array<{ name: CadCapabilityName; input: unknown }> = [];
  const result = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([
      { id: "open", capability: "document.open", input: { path: "$input.path" } },
      { id: "layers", capability: "query.layers", input: { drawingId: "$steps.open.output.drawingId" } }
    ]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    capabilities: runtime(async (name, input) => {
      calls.push({ name, input });
      if (name === "document.open") return { drawingId: "drawing-1" };
      return { layers: ["A-WALL"] };
    })
  });

  assert.deepEqual(calls, [
    { name: "document.open", input: { path: "drawing.dwg" } },
    { name: "query.layers", input: { drawingId: "drawing-1" } }
  ]);
  assert.deepEqual(result, {
    skillId: "workflow-test",
    status: "passed",
    steps: [
      { id: "open", status: "passed", output: { drawingId: "drawing-1" } },
      { id: "layers", status: "passed", output: { layers: ["A-WALL"] } }
    ],
    warnings: []
  });
});

test("rejects malformed workflow values, unsafe IDs, duplicate IDs, and more than thirty-two steps", () => {
  assert.throws(() => parseCadSkillWorkflow({
    schemaVersion: "cad-skill-workflow/v1",
    steps: [{ id: "__proto__", capability: "query.layers", input: {} }]
  }), /WORKFLOW_INVALID/);
  assert.throws(() => parseCadSkillWorkflow({
    schemaVersion: "cad-skill-workflow/v1",
    steps: [
      { id: "same", capability: "query.layers", input: {} },
      { id: "same", capability: "query.layers", input: {} }
    ]
  }), /WORKFLOW_INVALID/);
  assert.throws(() => parseCadSkillWorkflow({
    schemaVersion: "cad-skill-workflow/v1",
    steps: Array.from({ length: 33 }, (_, index) => ({
      id: `step-${index}`,
      capability: "query.layers",
      input: {}
    }))
  }), /WORKFLOW_INVALID/);

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => parseCadSkillWorkflow({
    schemaVersion: "cad-skill-workflow/v1",
    steps: [{ id: "one", capability: "query.layers", input: circular }]
  }), /WORKFLOW_VALUE_NOT_JSON/);
  assert.throws(() => parseCadSkillWorkflow({
    schemaVersion: "cad-skill-workflow/v1",
    steps: [{ id: "one", capability: "query.layers", input: { count: Number.NaN } }]
  }), /WORKFLOW_VALUE_NOT_JSON/);
});

test("rejects forward, unknown, and prototype binding paths before capability execution", async () => {
  const cases = [
    "$steps.later.output",
    "$steps.missing.output.value",
    "$input.__proto__",
    "$steps.open.output.constructor"
  ];

  for (const binding of cases) {
    let calls = 0;
    await assert.rejects(() => runCadSkillWorkflow({
      skill: installedSkill(),
      workflow: workflow([
        { id: "open", capability: "document.open", input: { path: binding } },
        { id: "later", capability: "query.layers", input: {} }
      ]),
      input: { path: "drawing.dwg" },
      grantedPermissions: ["read"],
      capabilities: runtime(async () => {
        calls += 1;
        return { drawingId: "drawing-1" };
      })
    }), /WORKFLOW_BINDING_INVALID/);
    assert.equal(calls, 0);
  }
});

test("fails with a bounded error when a capability is missing from the manifest", async () => {
  const result = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([{ id: "undeclared", capability: "query.text", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    capabilities: runtime(async () => {
      throw new Error("must not run");
    })
  });

  assert.deepEqual(result, failed("undeclared", "CAPABILITY_NOT_DECLARED"));
});

test("fails when the skill is incompatible or permissions are not both declared and granted", async () => {
  const incompatible = await runCadSkillWorkflow({
    skill: installedSkill({ compatible: false, incompatibility: "CAPABILITY_CONTRACT_MISMATCH" }),
    workflow: workflow([{ id: "layers", capability: "query.layers", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    capabilities: runtime(async () => ({ layers: [] }))
  });
  assert.deepEqual(incompatible, failed("layers", "SKILL_INCOMPATIBLE"));

  const readDenied = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([{ id: "layers", capability: "query.layers", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: [],
    capabilities: runtime(async () => ({ layers: [] }))
  });
  assert.deepEqual(readDenied, failed("layers", "PERMISSION_DENIED"));

  const proposedEditDenied = await runCadSkillWorkflow({
    skill: installedSkill({
      manifest: { ...readManifest, permissions: ["propose-edit"], capabilities: ["edit.preview"] }
    }),
    workflow: workflow([{ id: "preview", capability: "edit.preview", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: [],
    capabilities: runtime(async () => ({ layers: [] }))
  });
  assert.deepEqual(proposedEditDenied, failed("preview", "PERMISSION_DENIED"));
});

test("fails safely when a capability output violates the skill output schema", async () => {
  const result = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([{ id: "layers", capability: "query.layers", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    capabilities: runtime(async () => ({ layers: [3] }))
  });

  assert.deepEqual(result, failed("layers", "OUTPUT_SCHEMA_INVALID"));
});

test("bounds every encoded result to one MiB without exposing capability data", async () => {
  const result = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([{ id: "layers", capability: "query.layers", input: {} }]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    capabilities: runtime(async () => ({ layers: ["sensitive-" + "x".repeat(1024 * 1024)] }))
  });

  assert.deepEqual(result, failed("layers", "RESULT_TOO_LARGE"));
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") < 1024 * 1024);
});

test("uses the identical AbortSignal for every capability and returns cancelled without leaking errors", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const result = await runCadSkillWorkflow({
    skill: installedSkill(),
    workflow: workflow([
      { id: "open", capability: "document.open", input: { path: "$input.path" } },
      { id: "layers", capability: "query.layers", input: {} }
    ]),
    input: { path: "drawing.dwg" },
    grantedPermissions: ["read"],
    signal: controller.signal,
    capabilities: runtime(async (name, _input, signal) => {
      signals.push(signal!);
      if (name === "document.open") {
        controller.abort();
        return { drawingId: "drawing-1" };
      }
      throw new Error("must not run");
    })
  });

  assert.deepEqual(signals, [controller.signal]);
  assert.deepEqual(result, {
    skillId: "workflow-test",
    status: "cancelled",
    steps: [
      { id: "open", status: "cancelled", output: { error: { code: "CANCELLED" } } }
    ],
    warnings: []
  });
});

function workflow(steps: CadSkillWorkflow["steps"]): CadSkillWorkflow {
  return { schemaVersion: "cad-skill-workflow/v1", steps };
}

function installedSkill(overrides: Partial<InstalledCadSkill> = {}): InstalledCadSkill {
  return {
    root: "C:\\skills\\workflow-test",
    manifest: readManifest,
    instructions: "Use only deterministic evidence.",
    compatible: true,
    incompatibility: null,
    ...overrides
  };
}

function runtime(
  execute: (name: CadCapabilityName, input: unknown, signal?: AbortSignal) => Promise<unknown>
): CadCapabilityRuntime {
  return { execute };
}

function failed(id: string, code: string) {
  return {
    skillId: "workflow-test",
    status: "failed",
    steps: [{ id, status: "failed", output: { error: { code } } }],
    warnings: []
  };
}
