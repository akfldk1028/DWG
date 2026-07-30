import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { createReadCapabilityModule } from "@dwg/cad-capabilities";
import {
  parseCadSkillManifest,
  parseCadSkillWorkflow,
  type CadEntityIndex
} from "@dwg/skill-contracts";

import { buildCadIndexForPath } from "../../modules/cad-runtime/src/application/cad-tools/runtime.js";
import { createCadApplication } from "../../modules/cad-runtime/src/application/createCadApplication.js";
import {
  discoverCadSkills,
  runCadSkillWorkflow,
  type InstalledCadSkill
} from "../../modules/skill-runtime/src/index.js";

const skillRoot = resolve("skills");
const dxfFixture = "tests/fixtures/dxf/minimal-architectural.dxf";

const expectedCapabilities: Record<string, readonly string[]> = {
  "inspect-drawing": ["document.open", "document.describe", "query.layers", "query.entities"],
  "extract-schedule": ["query.text", "query.schedule"],
  "compare-drawings": ["query.compare"]
};

test("discovers exactly the three grounded read-only built-in skills", async () => {
  const skills = await discoverCadSkills(skillRoot, "cad-capabilities/v1");

  assert.deepEqual(
    skills.map((skill) => skill.manifest.id),
    Object.keys(expectedCapabilities).sort()
  );
  for (const skill of skills) {
    assert.deepEqual(skill.manifest.permissions, ["read"]);
    assert.deepEqual(skill.manifest.capabilities, expectedCapabilities[skill.manifest.id]);
    assert.match(skill.instructions, /^---\r?\nname: [a-z0-9]+(?:-[a-z0-9]+)*\r?\ndescription: Use when .+\r?\n---\r?\n/);
    assert.match(skill.instructions, /model geometry inference is forbidden/i);
    assert.match(skill.instructions, /unsupported/i);
    assert.doesNotMatch(skill.instructions, /(?:[A-Za-z]:[\\/]|\/Users\/|api[_ -]?key|secret)/i);
  }
});

test("built-in skills have strict sanitized workflow cases and examples", async () => {
  for (const id of Object.keys(expectedCapabilities)) {
    const root = resolve(skillRoot, id);
    const [manifestValue, workflowValue, casesValue, input, output] = await Promise.all([
      readJson(resolve(root, "manifest.json")),
      readJson(resolve(root, "workflows/default.json")),
      readJson(resolve(root, "tests/cases.json")),
      readJson(resolve(root, "examples/input.json")),
      readJson(resolve(root, "examples/output.json"))
    ]);
    const manifest = parseCadSkillManifest(manifestValue);
    const workflow = parseCadSkillWorkflow(workflowValue);

    assert.equal(manifest.id, id);
    assert.deepEqual(workflow.steps.map((step) => step.capability), expectedCapabilities[id]);
    assertCases(casesValue, id);
    assertJson(input);
    assertJson(output);
    assert.doesNotMatch(JSON.stringify({ manifestValue, workflowValue, casesValue, input, output }), /(?:[A-Za-z]:[\\/]|\/Users\/|api[_ -]?key|secret)/i);
  }
});

test("inspect-drawing workflow runs against the official DXF fixture with grounded entity evidence", async () => {
  const skill = await installed("inspect-drawing");
  const [workflow, input, expected] = await skillFiles(skill.manifest.id);
  const application = await createCadApplication({ workspaceRoot: resolve(".") });

  const result = await runCadSkillWorkflow({
    skill,
    workflow,
    input,
    grantedPermissions: ["read"],
    capabilities: application.capabilities
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(finalOutput(result), expected);
  assertGroundedMatches(finalOutput(result));
});

test("extract-schedule workflow runs against the official DXF fixture", async () => {
  const skill = await installed("extract-schedule");
  const [workflow, input, expected] = await skillFiles(skill.manifest.id);
  const application = await createCadApplication({ workspaceRoot: resolve(".") });
  const opened = await application.capabilities.execute("document.open", { path: dxfFixture });
  assert.equal((opened as { drawingId: string }).drawingId, (input as { drawingId: string }).drawingId);

  const result = await runCadSkillWorkflow({
    skill,
    workflow,
    input,
    grantedPermissions: ["read"],
    capabilities: application.capabilities
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(finalOutput(result), expected);
  assertGroundedMatches(result.steps[0]!.output);
});

test("compare-drawings workflow reports fixture-derived changes with grounded evidence", async () => {
  const skill = await installed("compare-drawings");
  const [workflow, input, expected] = await skillFiles(skill.manifest.id);
  const before = await buildCadIndexForPath(dxfFixture);
  const after = changedFixtureIndex(before);
  const capabilities = createReadCapabilityModule({
    async open() {
      throw new Error("compare workflow does not open drawings");
    },
    get(drawingId) {
      if (drawingId === "fixture-before") return before;
      if (drawingId === "fixture-after") return after;
      return null;
    }
  });

  const result = await runCadSkillWorkflow({
    skill,
    workflow,
    input,
    grantedPermissions: ["read"],
    capabilities
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(finalOutput(result), expected);
  const comparison = finalOutput(result) as { added: unknown[]; removed: unknown[]; changed: Array<{ before: unknown; after: unknown }> };
  for (const match of [...comparison.added, ...comparison.removed, ...comparison.changed.flatMap((change) => [change.before, change.after])]) {
    assertGroundedMatch(match);
  }
});

async function installed(id: string): Promise<InstalledCadSkill> {
  const skills = await discoverCadSkills(skillRoot, "cad-capabilities/v1");
  const skill = skills.find((candidate) => candidate.manifest.id === id);
  assert.ok(skill, `Missing ${id} skill.`);
  return skill;
}

async function skillFiles(id: string) {
  const root = resolve(skillRoot, id);
  return Promise.all([
    readJson(resolve(root, "workflows/default.json")).then(parseCadSkillWorkflow),
    readJson(resolve(root, "examples/input.json")),
    readJson(resolve(root, "examples/output.json"))
  ]);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function finalOutput(result: { steps: Array<{ output: unknown }> }): unknown {
  const step = result.steps.at(-1);
  assert.ok(step, "Expected a workflow result step.");
  return step.output;
}

function changedFixtureIndex(index: CadEntityIndex): CadEntityIndex {
  const changed = structuredClone(index);
  changed.drawingId = "fixture-after";
  const text = changed.entities.find((entity) => entity.handle === "30");
  assert.ok(text, "Expected TEXT handle 30 in the official DXF fixture.");
  text.text = "ROOM 102";
  return changed;
}

function assertGroundedMatches(value: unknown): void {
  const matches = (value as { matches?: unknown }).matches;
  assert.ok(Array.isArray(matches), "Expected a matches array.");
  for (const match of matches) assertGroundedMatch(match);
}

function assertGroundedMatch(value: unknown): void {
  const match = value as Record<string, unknown>;
  assert.equal(typeof match.handle, "string");
  assert.equal(typeof match.type, "string");
  assert.equal(typeof match.layer, "string");
  assert.ok(match.bbox && typeof match.bbox === "object");
}

function assertCases(value: unknown, id: string): void {
  const cases = value as { schemaVersion?: unknown; skillId?: unknown; cases?: unknown };
  assert.deepEqual(Object.keys(cases).sort(), ["cases", "schemaVersion", "skillId"]);
  assert.equal(cases.schemaVersion, "cad-skill-cases/v1");
  assert.equal(cases.skillId, id);
  assert.ok(Array.isArray(cases.cases) && cases.cases.length > 0);
  for (const testCase of cases.cases) {
    const entry = testCase as Record<string, unknown>;
    assert.deepEqual(Object.keys(entry).sort(), ["fixture", "id", "input", "output"]);
    assert.equal(typeof entry.id, "string");
    assert.match(entry.fixture as string, /^(?:dxf\.minimal-architectural|dwg\.export-sample)$/);
    assert.equal(entry.input, "examples/input.json");
    assert.equal(entry.output, "examples/output.json");
  }
}

function assertJson(value: unknown): void {
  assert.doesNotThrow(() => JSON.stringify(value));
}
