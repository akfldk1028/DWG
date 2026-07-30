import { z } from "zod";

import {
  SKILL_PERMISSIONS,
  type SkillPermission
} from "./permissions.js";

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const semanticVersion = z.string().regex(
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
);
const code = z.string().regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);

export interface CadSkillManifest {
  id: string;
  version: string;
  purpose: string;
  capabilityContract: "cad-capabilities/v1";
  permissions: SkillPermission[];
  capabilities: string[];
  formats: Array<"dwg" | "dxf">;
  entityTypes: string[];
  failureCodes: string[];
  limitationCodes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const cadSkillManifestSchema = z.object({
  id: identifier,
  version: semanticVersion,
  purpose: z.string().trim().min(1),
  capabilityContract: z.literal("cad-capabilities/v1"),
  permissions: z.array(z.enum(SKILL_PERMISSIONS)).refine(isUnique),
  capabilities: z.array(z.string().trim().min(1)),
  formats: z.array(z.enum(["dwg", "dxf"])),
  entityTypes: z.array(z.string().trim().min(1)),
  failureCodes: z.array(code).min(1).refine(isUnique),
  limitationCodes: z.array(code).min(1).refine(isUnique),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown())
}).strict();

export function parseCadSkillManifest(value: unknown): CadSkillManifest {
  return cadSkillManifestSchema.parse(value);
}

function isUnique(values: readonly string[]) {
  return new Set(values).size === values.length;
}
