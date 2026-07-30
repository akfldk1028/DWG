import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  MAX_SKILL_JSON_BYTES,
  parseSkillRunRequest
} from "@dwg/contracts";
import {
  discoverCadSkills,
  loadCadSkillWorkflow,
  runCadSkillWorkflow
} from "@dwg/skill-runtime";

import { createCadApplication } from "../src/application/createCadApplication.js";
import {
  createRepositoryPaths,
  findRepositoryRoot
} from "../src/platform/repositoryPaths.js";
import { resolveCliDocumentScope } from "./skillRunScope.js";

interface SkillSummary {
  skillId: string;
  status: "passed" | "failed";
  changeCount: number;
  warningCount: number;
  hasPreview: boolean;
}

const parsed = parseArguments(process.argv.slice(2));
if (parsed === null) {
  writeSummary({ skillId: "unknown", status: "failed", changeCount: 0, warningCount: 1, hasPreview: false });
  process.exitCode = 2;
} else {
  await run(
    parsed.skillId,
    parsed.inputPath,
    parsed.version,
    parsed.documentId,
    parsed.relatedDocumentIds
  );
}

async function run(
  skillId: string,
  inputPath: string,
  version?: string,
  declaredDocumentId?: string,
  declaredRelatedDocumentIds: readonly string[] = []
): Promise<void> {
  try {
    const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
    const inputText = await readFile(resolve(inputPath), "utf8");
    if (new TextEncoder().encode(inputText).byteLength > MAX_SKILL_JSON_BYTES) throw new Error("INPUT_TOO_LARGE");
    const input = JSON.parse(inputText) as unknown;
    const application = await createCadApplication({ workspaceRoot: paths.repositoryRoot });
    const scope = await resolveCliDocumentScope(
      input,
      declaredDocumentId,
      declaredRelatedDocumentIds,
      application.capabilities
    );
    const request = parseSkillRunRequest({
      skillId,
      version: version ?? "1.0.0",
      documentId: scope.documentId,
      ...(scope.relatedDocumentIds.length === 0
        ? {}
        : { relatedDocumentIds: scope.relatedDocumentIds }),
      input
    });
    const skills = await discoverCadSkills(resolve(paths.repositoryRoot, "skills"), "cad-capabilities/v1");
    const skill = skills.find((item) => item.manifest.id === request.skillId && item.manifest.version === request.version);
    if (!skill || !skill.compatible) throw new Error("SKILL_UNAVAILABLE");
    const workflow = await loadCadSkillWorkflow(skill);
    const result = await runCadSkillWorkflow({
      skill,
      workflow,
      input: request.input,
      documentId: request.documentId,
      relatedDocumentIds: request.relatedDocumentIds,
      grantedPermissions: skill.manifest.permissions,
      capabilities: application.capabilities
    });
    const final = result.status === "passed" ? result.steps.at(-1)?.output : null;
    const warningCount = result.status === "passed" ? result.warnings.length : failureCount(result);
    writeSummary({
      skillId: request.skillId,
      status: result.status === "passed" ? "passed" : "failed",
      changeCount: countOf(final),
      warningCount,
      hasPreview: previewOf(final)
    });
    process.exitCode = result.status === "passed" ? 0 : 1;
  } catch {
    writeSummary({ skillId: safeSkillId(skillId), status: "failed", changeCount: 0, warningCount: 1, hasPreview: false });
    process.exitCode = 1;
  }
}

function parseArguments(args: string[]): {
  skillId: string;
  inputPath: string;
  version?: string;
  documentId?: string;
  relatedDocumentIds: string[];
} | null {
  if (args.length < 4 || args.length % 2 !== 0) return null;
  if (args[0] !== "--skill" || args[2] !== "--input") return null;
  if (!args[1] || !args[3]) return null;
  let version: string | undefined;
  let documentId: string | undefined;
  const relatedDocumentIds: string[] = [];
  for (let index = 4; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!value) return null;
    if (name === "--version" && version === undefined) version = value;
    else if (name === "--document-id" && documentId === undefined) documentId = value;
    else if (name === "--related-document-id") relatedDocumentIds.push(value);
    else return null;
  }
  if (relatedDocumentIds.length > 3) return null;
  return {
    skillId: args[1],
    inputPath: args[3],
    version,
    documentId,
    relatedDocumentIds
  };
}

function failureCount(result: Awaited<ReturnType<typeof runCadSkillWorkflow>>): number {
  const error = result.steps.at(-1)?.output as { error?: { code?: unknown } } | undefined;
  return Math.min(64, new Set([...result.warnings, typeof error?.error?.code === "string" ? error.error.code : "FAILED"]).size);
}

function countOf(value: unknown): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return 0;
  const count = (value as { changeCount?: unknown }).changeCount;
  return Number.isSafeInteger(count) && (count as number) >= 0 ? count as number : 0;
}

function previewOf(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && typeof (value as { previewId?: unknown }).previewId === "string";
}

function safeSkillId(value: string): string {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64 ? value : "unknown";
}

function writeSummary(summary: SkillSummary): void {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
