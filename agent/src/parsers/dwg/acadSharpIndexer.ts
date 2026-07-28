import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import type { CadEntityIndex } from "../../domain/cad-index/types.js";

const execFileAsync = promisify(execFile);
const parserProject = resolve(
  "backend/src/DwgIntelligence.DwgParser/DwgIntelligence.DwgParser.csproj"
);
const indexByPath = new Map<string, Promise<CadEntityIndex>>();

export async function buildIndexFromDwgFile(path: string): Promise<CadEntityIndex> {
  const fullPath = resolve(path);
  const existing = indexByPath.get(fullPath);
  if (existing) return existing;

  const pending = runDwgParser(fullPath).catch((error) => {
    indexByPath.delete(fullPath);
    throw error;
  });
  indexByPath.set(fullPath, pending);
  return pending;
}

async function runDwgParser(fullPath: string): Promise<CadEntityIndex> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      "dotnet",
      [
        "run",
        "--project",
        parserProject,
        "--no-build",
        "--no-launch-profile",
        "--",
        "index",
        fullPath
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      }
    );
    stdout = result.stdout;
  } catch (error) {
    const processError = error as Error & { stderr?: string };
    const detail = processError.stderr?.trim() || processError.message;
    throw new Error(`DWG parser failed: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("DWG parser returned invalid JSON");
  }

  if (!isCadDwgIndex(parsed)) {
    throw new Error("DWG parser returned an incompatible cad-index document");
  }

  return parsed;
}

function isCadDwgIndex(value: unknown): value is CadEntityIndex {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CadEntityIndex>;
  return (
    candidate.schemaVersion === "cad-index/v0.1" &&
    candidate.source?.kind === "dwg" &&
    typeof candidate.drawingId === "string" &&
    Array.isArray(candidate.layers) &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.unsupported)
  );
}
