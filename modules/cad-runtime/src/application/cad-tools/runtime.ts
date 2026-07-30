import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  composeCadCapabilityModules,
  createReadCapabilityModule,
  type CadCapabilityRuntime
} from "@dwg/cad-capabilities";
import type { CadEntityIndex } from "@dwg/contracts";

import { buildIndexFromDxfFileName } from "../../parsers/dxf/dxfIndexer.js";
import { buildIndexFromDwgFile } from "../../parsers/dwg/acadSharpIndexer.js";
import { resolveWorkspaceCadPath } from "../drawing-access/workspacePath.js";

type ToolArguments = Record<string, unknown>;

interface CadToolRuntimeOptions {
  workspaceRoot?: string;
}

export interface CadToolRuntime {
  call(name: string, args: ToolArguments, signal?: AbortSignal): Promise<any>;
}

export function createCadToolRuntime(
  options: CadToolRuntimeOptions = {}
): CadToolRuntime {
  const runtime = createCadCapabilityRuntime(options);
  return {
    call(name, args, signal) {
      return executeCadTool(runtime, name, args, signal);
    }
  };
}

export function createCadCapabilityRuntime(
  options: CadToolRuntimeOptions = {}
): CadCapabilityRuntime {
  const drawings = new Map<string, CadEntityIndex>();
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const readCapabilities = createReadCapabilityModule({
    async open(path, signal) {
      const fullPath = resolveWorkspaceCadPath(workspaceRoot, path);
      const index = await buildCadIndexForPath(fullPath, signal);
      drawings.set(index.drawingId, index);
      return index;
    },
    get(drawingId) {
      return drawings.get(drawingId) ?? null;
    }
  });

  return composeCadCapabilityModules([readCapabilities]);
}

export async function executeCadTool(
  runtime: CadCapabilityRuntime,
  name: string,
  args: ToolArguments,
  signal?: AbortSignal
): Promise<unknown> {
  switch (name) {
    case "cad.open_drawing":
      return runtime.execute("document.open", args, signal);
    case "cad.build_index": {
      const description = await runtime.execute("document.describe", args, signal) as {
        drawingId: string;
        indexUri: string;
        summary: unknown;
      };
      return {
        drawingId: description.drawingId,
        indexUri: description.indexUri,
        summary: description.summary
      };
    }
    case "cad.get_layers":
      return runtime.execute("query.layers", args, signal);
    case "cad.find_entities_by_layer":
    case "cad.find_entities_by_type":
    case "cad.get_entity":
      return runtime.execute("query.entities", args, signal);
    case "cad.find_text":
      return runtime.execute("query.text", args, signal);
    case "cad.list_unsupported": {
      const description = await runtime.execute("document.describe", args, signal) as {
        unsupported: unknown;
      };
      return { unsupported: description.unsupported };
    }
    default:
      throw new Error(`Unknown CAD tool: ${name}`);
  }
}

export async function buildCadIndexForPath(
  path: string,
  signal?: AbortSignal
): Promise<CadEntityIndex> {
  if (signal?.aborted) {
    throw signal.reason;
  }
  const extension = extname(path).toLowerCase();
  if (extension === ".dwg") {
    return buildIndexFromDwgFile(path);
  }
  if (extension === ".dxf") {
    return buildIndexFromDxfFileName(await readFile(path, "utf8"), path);
  }
  throw new Error(`Unsupported drawing format: ${extension || "(none)"}`);
}
