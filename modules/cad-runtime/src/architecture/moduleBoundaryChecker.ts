import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative, resolve, sep } from "node:path";

export interface ModuleImport {
  importer: string;
  specifier: string;
}

export interface ModuleBoundaryViolation extends ModuleImport {
  importedModule: string;
  rule:
    | "contracts-are-runtime-independent"
    | "agent-does-not-import-frontend"
    | "frontend-does-not-import-agent"
    | "frontend-shared-does-not-import-features"
    | "frontend-features-do-not-cross-import";
}

export function findModuleBoundaryViolations(
  imports: readonly ModuleImport[]
): ModuleBoundaryViolation[] {
  return imports.flatMap((moduleImport) => {
    const importedModule = resolveModule(
      moduleImport.importer,
      moduleImport.specifier
    );
    if (!importedModule) return [];

    const rule = findViolatedRule(moduleImport.importer, importedModule);
    return rule ? [{ ...moduleImport, importedModule, rule }] : [];
  });
}

export async function scanWorkspaceModuleBoundaries(workspace: string) {
  const sourceRoots = [
    "packages/contracts/src",
    "modules/cad-runtime/src",
    "apps/workspace/src"
  ];
  const imports: ModuleImport[] = [];

  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = resolve(workspace, sourceRoot);
    for (const file of await listTypeScriptFiles(absoluteRoot)) {
      const importer = toPosix(relative(workspace, file));
      const source = await readFile(file, "utf8");
      for (const specifier of extractImportSpecifiers(source)) {
        imports.push({ importer, specifier });
      }
    }
  }

  return findModuleBoundaryViolations(imports);
}

function findViolatedRule(
  importer: string,
  importedModule: string
): ModuleBoundaryViolation["rule"] | null {
  if (
    importer.startsWith("packages/contracts/") &&
    (importedModule.startsWith("modules/cad-runtime/") ||
      importedModule.startsWith("apps/workspace/"))
  ) {
    return "contracts-are-runtime-independent";
  }
  if (
    importer.startsWith("modules/cad-runtime/") &&
    importedModule.startsWith("apps/workspace/")
  ) {
    return "agent-does-not-import-frontend";
  }
  if (
    importer.startsWith("apps/workspace/") &&
    importedModule.startsWith("modules/cad-runtime/")
  ) {
    return "frontend-does-not-import-agent";
  }
  if (
    importer.startsWith("apps/workspace/src/shared/") &&
    importedModule.startsWith("apps/workspace/src/features/")
  ) {
    return "frontend-shared-does-not-import-features";
  }

  const importerFeature = getFrontendFeature(importer);
  const importedFeature = getFrontendFeature(importedModule);
  if (
    importerFeature &&
    importedFeature &&
    importerFeature !== importedFeature
  ) {
    return "frontend-features-do-not-cross-import";
  }
  return null;
}

function resolveModule(importer: string, specifier: string) {
  if (!specifier.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(importer), specifier));
}

function getFrontendFeature(path: string) {
  const match = /^apps\/workspace\/src\/features\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

function extractImportSpecifiers(source: string) {
  const specifiers: string[] = [];
  const importPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function toPosix(path: string) {
  return path.split(sep).join("/");
}
