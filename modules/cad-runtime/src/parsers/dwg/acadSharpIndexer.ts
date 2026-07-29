import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import {
  isCadEntityIndexV02,
  type CadEntityIndexV02
} from "@dwg/contracts";
import {
  createRepositoryPaths,
  findRepositoryRoot
} from "../../platform/repositoryPaths.js";

const execFileAsync = promisify(execFile);
const defaultParserProject = createRepositoryPaths(
  findRepositoryRoot(import.meta.url)
).parserProject;
const indexByPath = new Map<string, Promise<CadEntityIndexV02>>();

export interface DwgIndexerOptions {
  parserProject?: string;
}

export async function buildIndexFromDwgFile(
  path: string,
  options: DwgIndexerOptions = {}
): Promise<CadEntityIndexV02> {
  const fullPath = resolve(path);
  const existing = indexByPath.get(fullPath);
  if (existing) return existing;

  const pending = runDwgParser(
    fullPath,
    options.parserProject ?? defaultParserProject
  ).catch((error) => {
    indexByPath.delete(fullPath);
    throw error;
  });
  indexByPath.set(fullPath, pending);
  return pending;
}

async function runDwgParser(
  fullPath: string,
  parserProject: string
): Promise<CadEntityIndexV02> {
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

  if (!isCadEntityIndexV02(parsed) || parsed.source.kind !== "dwg") {
    throw new Error("DWG parser returned an incompatible cad-index document");
  }

  return parsed;
}
