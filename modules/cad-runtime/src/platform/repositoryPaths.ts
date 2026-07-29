import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RepositoryPaths {
  repositoryRoot: string;
  parserProject: string;
  fixturesRoot: string;
  defaultDrawing: string;
}

export function findRepositoryRoot(fromUrl = import.meta.url): string {
  let cursor = dirname(fileURLToPath(fromUrl));
  while (true) {
    const packagePath = join(cursor, "package.json");
    if (existsSync(packagePath)) {
      const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
      if (manifest.name === "click-around") return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error("Click Around repository root was not found");
    }
    cursor = parent;
  }
}

export function createRepositoryPaths(repositoryRoot: string): RepositoryPaths {
  const root = resolve(repositoryRoot);
  return {
    repositoryRoot: root,
    parserProject: resolve(
      root,
      "modules/dwg-parser/src/DwgIntelligence.DwgParser/DwgIntelligence.DwgParser.csproj"
    ),
    fixturesRoot: resolve(root, "tests/fixtures"),
    defaultDrawing: resolve(root, "tests/fixtures/dwg/export_sample.dwg")
  };
}
