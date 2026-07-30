import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import test from "node:test";

const workspaceRoots = ["apps", "packages", "modules"];

test("every declared workspace entrypoint exists", async () => {
  for (const workspace of await findWorkspacePackages()) {
    for (const entrypoint of declaredEntrypoints(workspace.manifest)) {
      await access(resolve(workspace.path, entrypoint));
    }
  }
});

test("root test command discovers package, module, workspace unit, and script tests", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(root.scripts.test, /"packages\/\*\*\/\*.test\.ts"/);
  assert.match(root.scripts.test, /"modules\/\*\*\/\*.test\.ts"/);
  assert.match(root.scripts.test, /"apps\/workspace\/tests\/unit\/\*\*\/\*.test\.ts"/);
  assert.match(root.scripts.test, /"scripts\/\*\*\/\*.test\.mjs"/);
});

async function findWorkspacePackages() {
  const packages = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const entry of await readdir(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const path = posix.join(workspaceRoot, entry.name);
      try {
        const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
        packages.push({ path, manifest });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return packages;
}

function declaredEntrypoints(manifest) {
  if (!manifest.exports) return [];
  return collectEntrypointFiles(manifest.exports);
}

function collectEntrypointFiles(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectEntrypointFiles);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectEntrypointFiles);
}
