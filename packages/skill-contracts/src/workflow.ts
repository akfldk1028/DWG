import { z } from "zod";

export const MAX_CAD_SKILL_WORKFLOW_STEPS = 32;

export interface CadSkillWorkflowStep {
  id: string;
  capability: string;
  input: Record<string, unknown>;
}

export interface CadSkillWorkflow {
  schemaVersion: "cad-skill-workflow/v1";
  steps: CadSkillWorkflowStep[];
}

const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

const workflowSchema = z.object({
  schemaVersion: z.literal("cad-skill-workflow/v1"),
  steps: z.array(z.object({
    id: z.string().regex(identifier),
    capability: z.string().regex(/^(?:document|query|edit)\.[a-z][a-z0-9-]*$/),
    input: z.record(z.unknown())
  }).strict()).min(1).max(MAX_CAD_SKILL_WORKFLOW_STEPS)
}).strict();

export function parseCadSkillWorkflow(value: unknown): CadSkillWorkflow {
  assertJsonValue(value);
  let workflow: CadSkillWorkflow;
  try {
    workflow = workflowSchema.parse(value);
  } catch {
    throw new Error("WORKFLOW_INVALID");
  }
  if (new Set(workflow.steps.map((step) => step.id)).size !== workflow.steps.length) {
    throw new Error("WORKFLOW_INVALID");
  }
  return workflow;
}

export function assertCadSkillJsonValue(value: unknown): void {
  assertJsonValue(value);
}

export function cloneCadSkillJsonValue<T>(value: T): T {
  assertJsonValue(value);
  return clone(value) as T;
}

function assertJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error("WORKFLOW_VALUE_NOT_JSON");
  }
  if (typeof value !== "object") throw new Error("WORKFLOW_VALUE_NOT_JSON");
  if (ancestors.has(value)) throw new Error("WORKFLOW_VALUE_NOT_JSON");

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, ancestors);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error("WORKFLOW_VALUE_NOT_JSON");
    }
    for (const key of Object.keys(value)) {
      if (forbiddenKeys.has(key)) throw new Error("WORKFLOW_VALUE_NOT_JSON");
      assertJsonValue((value as Record<string, unknown>)[key], ancestors);
    }
  }
  ancestors.delete(value);
}

function clone(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const copied: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copied[key] = clone((value as Record<string, unknown>)[key]);
  return copied;
}
