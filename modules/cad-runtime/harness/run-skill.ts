import { mkdir, readFile } from "node:fs/promises";
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
import { defaultProcessRunner } from "../src/providers/cli/processRunner.js";
import {
  preloadCliComparisonScope,
  resolveCliDocumentScope
} from "./skillRunScope.js";

interface SkillSummary {
  skillId: string;
  status: "passed" | "failed";
  changeCount: number;
  warningCount: number;
  hasPreview: boolean;
}

const MAX_CLI_DRAWING_PATH_CHARS = 4_096;

const parsed = parseArguments(process.argv.slice(2));
if (parsed === null) {
  writeSummary({ skillId: "unknown", status: "failed", changeCount: 0, warningCount: 1, hasPreview: false });
  process.exitCode = 2;
} else {
  await run(parsed);
}

interface SkillCliArguments {
  skillId: string;
  inputPath: string;
  version?: string;
  documentId?: string;
  relatedDocumentIds: string[];
  beforePath?: string;
  afterPath?: string;
  drawingPath?: string;
}

async function run(parsed: SkillCliArguments): Promise<void> {
  const {
    skillId,
    inputPath,
    version,
    documentId: declaredDocumentId,
    relatedDocumentIds: declaredRelatedDocumentIds,
    beforePath,
    afterPath,
    drawingPath
  } = parsed;
  try {
    const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
    const inputText = await readFile(resolve(inputPath), "utf8");
    if (new TextEncoder().encode(inputText).byteLength > MAX_SKILL_JSON_BYTES) throw new Error("INPUT_TOO_LARGE");
    const suppliedInput = JSON.parse(inputText) as unknown;
    const configuredDrawingPath = drawingPath ??
      beforePath ??
      drawingPathFromInput(suppliedInput);
    const exportRoot = resolve(
      paths.repositoryRoot,
      `tests/visual/test-results/export-roots/cli-${process.pid}`
    );
    await mkdir(exportRoot, { recursive: true });
    const application = await createCadApplication({
      workspaceRoot: paths.repositoryRoot,
      drawingPath: configuredDrawingPath,
      exportRoot,
      dwgVersionManifestPath: paths.dwgVersionManifest,
      processRunner: {
        async run(spec, signal) {
          const result = await defaultProcessRunner.run({
            command: spec.command,
            args: spec.args,
            cwd: spec.cwd,
            env: process.env,
            stdin: spec.stdin,
            signal
          });
          return {
            exitCode: result.exitCode ?? -1,
            stdout: result.stdout,
            stderr: result.stderr
          };
        }
      },
      clock: Date.now
    });
    const controller = new AbortController();
    const signal = controller.signal;
    const isComparisonPreload = beforePath !== undefined && afterPath !== undefined;
    const scope = skillId === "export-drawing"
      ? {
          documentId: application.currentIndex().drawingId,
          relatedDocumentIds: [] as string[]
        }
      : isComparisonPreload
      ? await preloadCliComparisonScope(
        beforePath,
        afterPath,
        application.capabilities,
        signal
      )
      : await resolveCliDocumentScope(
        suppliedInput,
        declaredDocumentId,
        declaredRelatedDocumentIds,
        application.capabilities,
        signal
      );
    const input = isComparisonPreload
      ? withComparisonDocumentIds(
        suppliedInput,
        scope.documentId,
        scope.relatedDocumentIds[0]!
      )
      : suppliedInput;
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
    const hostInput = skillId === "export-drawing"
      ? await createExportHostInput(application, scope.documentId, signal)
      : {};
    const result = await runCadSkillWorkflow({
      skill,
      workflow,
      input: request.input,
      hostInput,
      documentId: request.documentId,
      relatedDocumentIds: request.relatedDocumentIds,
      grantedPermissions: skill.manifest.permissions,
      capabilities: application.capabilities,
      signal
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

function parseArguments(args: string[]): SkillCliArguments | null {
  if (args.length < 4 || args.length % 2 !== 0) return null;
  if (args[0] !== "--skill" || args[2] !== "--input") return null;
  if (!args[1] || !args[3]) return null;
  let version: string | undefined;
  let documentId: string | undefined;
  let beforePath: string | undefined;
  let afterPath: string | undefined;
  let drawingPath: string | undefined;
  const relatedDocumentIds: string[] = [];
  for (let index = 4; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!value) return null;
    if (name === "--version" && version === undefined) version = value;
    else if (name === "--document-id" && documentId === undefined) documentId = value;
    else if (name === "--related-document-id") relatedDocumentIds.push(value);
    else if (name === "--before" && beforePath === undefined) beforePath = value;
    else if (name === "--after" && afterPath === undefined) afterPath = value;
    else if (name === "--drawing" && drawingPath === undefined) drawingPath = value;
    else return null;
  }
  if (relatedDocumentIds.length > 3) return null;
  if (drawingPath !== undefined && drawingPath.length > MAX_CLI_DRAWING_PATH_CHARS) return null;
  const hasComparisonPreload = beforePath !== undefined || afterPath !== undefined;
  if (
    hasComparisonPreload && (
      beforePath === undefined ||
      afterPath === undefined ||
      beforePath.length > MAX_CLI_DRAWING_PATH_CHARS ||
      afterPath.length > MAX_CLI_DRAWING_PATH_CHARS ||
      beforePath === afterPath ||
      args[1] !== "compare-drawings" ||
      documentId !== undefined ||
      relatedDocumentIds.length > 0
    )
  ) return null;
  if (args[1] === "compare-drawings" && !hasComparisonPreload) return null;
  if (args[1] === "export-drawing" && drawingPath === undefined) return null;
  return {
    skillId: args[1],
    inputPath: args[3],
    version,
    documentId,
    relatedDocumentIds,
    beforePath,
    afterPath,
    drawingPath
  };
}

function drawingPathFromInput(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const path = (value as Record<string, unknown>).path;
  return typeof path === "string" && path.length <= MAX_CLI_DRAWING_PATH_CHARS
    ? path
    : undefined;
}

async function createExportHostInput(
  application: Awaited<ReturnType<typeof createCadApplication>>,
  documentId: string,
  signal: AbortSignal
): Promise<{ documentId: string; destinationGrantId: string }> {
  const grant = await application.requestDestinationGrant(signal);
  if (!grant) throw new Error("DESTINATION_SELECTION_CANCELLED");
  return {
    documentId,
    destinationGrantId: grant.grantId
  };
}

function withComparisonDocumentIds(
  value: unknown,
  beforeDrawingId: string,
  afterDrawingId: string
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INPUT_SCHEMA_INVALID");
  }
  return {
    ...value as Record<string, unknown>,
    beforeDrawingId,
    afterDrawingId
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
