import { Ajv } from "ajv";

import type { CadCapabilityRuntime } from "@dwg/cad-capabilities";
import {
  cloneCadSkillJsonValue,
  parseCadSkillManifest,
  parseCadSkillWorkflow,
  type CadSkillWorkflow,
  type SkillPermission
} from "@dwg/skill-contracts";

import type { InstalledCadSkill } from "./discovery.js";
import { requiredSkillPermission } from "./permissions.js";

export const MAX_CAD_SKILL_RUN_RESULT_BYTES = 1024 * 1024;
const BOUNDED_SKILL_ID = "bounded-skill-result";

export interface CadSkillRunStepResult {
  id: string;
  status: "passed" | "failed" | "cancelled";
  output: unknown;
}

export interface CadSkillRunResult {
  skillId: string;
  status: "passed" | "failed" | "cancelled";
  steps: CadSkillRunStepResult[];
  warnings: string[];
}

export interface RunCadSkillWorkflowOptions {
  skill: InstalledCadSkill;
  workflow: CadSkillWorkflow;
  input: unknown;
  grantedPermissions: SkillPermission[];
  capabilities: CadCapabilityRuntime;
  signal?: AbortSignal;
}

export async function runCadSkillWorkflow(options: RunCadSkillWorkflowOptions): Promise<CadSkillRunResult> {
  const workflow = parseCadSkillWorkflow(options.workflow);
  let manifest;
  try {
    manifest = parseCadSkillManifest(cloneCadSkillJsonValue(options.skill.manifest));
  } catch {
    return failWithoutStep(createResult(BOUNDED_SKILL_ID), "SKILL_MANIFEST_INVALID");
  }
  const result = createResult(manifest.id);
  let safeInput: unknown;
  try {
    safeInput = cloneCadSkillJsonValue(options.input);
  } catch {
    return failWithoutStep(result, "INPUT_VALUE_INVALID");
  }

  if (!validates(manifest.inputSchema, safeInput)) return failWithoutStep(result, "INPUT_SCHEMA_INVALID");

  for (const step of workflow.steps) {
    if (options.signal?.aborted) return cancel(result, step.id);
    if (!options.skill.compatible || manifest.capabilityContract !== "cad-capabilities/v1") {
      return fail(result, step.id, "SKILL_INCOMPATIBLE");
    }
    if (!manifest.capabilities.includes(step.capability)) return fail(result, step.id, "CAPABILITY_NOT_DECLARED");
    const permission = requiredSkillPermission(step.capability);
    if (permission === undefined || permission === null) return fail(result, step.id, "CAPABILITY_FORBIDDEN");
    if (!manifest.permissions.includes(permission) || !options.grantedPermissions.includes(permission)) {
      return fail(result, step.id, "PERMISSION_DENIED");
    }

    const boundInput = bindInput(step.input, safeInput, result.steps);
    let output: unknown;
    try {
      output = await options.capabilities.execute(step.capability as never, boundInput, options.signal);
    } catch {
      if (options.signal?.aborted) return cancel(result, step.id);
      return fail(result, step.id, "CAPABILITY_EXECUTION_FAILED");
    }
    if (options.signal?.aborted) return cancel(result, step.id);
    try {
      output = cloneCadSkillJsonValue(output);
    } catch {
      return fail(result, step.id, "CAPABILITY_OUTPUT_INVALID");
    }
    result.steps.push({ id: step.id, status: "passed", output });
    if (!withinLimit(result)) {
      result.steps.pop();
      return oversizedResult("failed");
    }
  }

  const finalOutput = result.steps.at(-1)?.output;
  if (!validates(manifest.outputSchema, finalOutput)) {
    const finalStep = result.steps.at(-1)!;
    result.steps.pop();
    return fail(result, finalStep.id, "OUTPUT_SCHEMA_INVALID");
  }
  if (!withinLimit(result)) return fail(result, result.steps.at(-1)!.id, "RESULT_TOO_LARGE");
  return result;
}

function bindInput(input: Record<string, unknown>, workflowInput: unknown, previousSteps: readonly CadSkillRunStepResult[]): Record<string, unknown> {
  return cloneCadSkillJsonValue(resolveBindings(input, workflowInput, previousSteps)) as Record<string, unknown>;
}

function resolveBindings(value: unknown, workflowInput: unknown, previousSteps: readonly CadSkillRunStepResult[]): unknown {
  if (typeof value === "string" && value.startsWith("$")) return resolveBinding(value, workflowInput, previousSteps);
  if (Array.isArray(value)) return value.map((item) => resolveBindings(item, workflowInput, previousSteps));
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) resolved[key] = resolveBindings(item, workflowInput, previousSteps);
    return resolved;
  }
  return value;
}

function resolveBinding(expression: string, workflowInput: unknown, previousSteps: readonly CadSkillRunStepResult[]): unknown {
  const input = /^\$input((?:\.[a-zA-Z_$][a-zA-Z0-9_$-]*)*)$/.exec(expression);
  if (input) return readBindingPath(workflowInput, input[1]!);
  const step = /^\$steps\.([a-z][a-z0-9-]{0,63})\.output((?:\.[a-zA-Z_$][a-zA-Z0-9_$-]*)*)$/.exec(expression);
  if (!step) throw new Error("WORKFLOW_BINDING_INVALID");
  const previous = previousSteps.find((item) => item.id === step[1]);
  if (!previous || previous.status !== "passed") throw new Error("WORKFLOW_BINDING_INVALID");
  return readBindingPath(previous.output, step[2]!);
}

function readBindingPath(value: unknown, suffix: string): unknown {
  let current = value;
  for (const key of suffix.split(".").filter(Boolean)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("WORKFLOW_BINDING_INVALID");
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, key)) {
      throw new Error("WORKFLOW_BINDING_INVALID");
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function validates(schema: Record<string, unknown>, value: unknown): boolean {
  try {
    return new Ajv({ allErrors: true, strict: true }).compile(schema)(value) === true;
  } catch {
    return false;
  }
}

function createResult(skillId: string): CadSkillRunResult {
  return { skillId, status: "passed", steps: [], warnings: [] };
}

function fail(result: CadSkillRunResult, id: string, code: string): CadSkillRunResult {
  result.status = "failed";
  result.steps.push({ id, status: "failed", output: { error: { code } } });
  return bounded(result);
}

function failWithoutStep(result: CadSkillRunResult, code: string): CadSkillRunResult {
  result.status = "failed";
  result.warnings.push(code);
  return bounded(result);
}

function cancel(result: CadSkillRunResult, id: string): CadSkillRunResult {
  result.status = "cancelled";
  result.steps.push({ id, status: "cancelled", output: { error: { code: "CANCELLED" } } });
  return bounded(result);
}

function withinLimit(result: CadSkillRunResult): boolean {
  return Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_CAD_SKILL_RUN_RESULT_BYTES;
}

function bounded(result: CadSkillRunResult): CadSkillRunResult {
  if (withinLimit(result)) return result;
  return oversizedResult(result.status);
}

function oversizedResult(
  status: CadSkillRunResult["status"]
): CadSkillRunResult {
  const code = status === "cancelled" ? "CANCELLED" : "RESULT_TOO_LARGE";
  return {
    skillId: BOUNDED_SKILL_ID,
    status,
    steps: [{ id: "result", status: status === "cancelled" ? "cancelled" : "failed", output: { error: { code } } }],
    warnings: []
  };
}
