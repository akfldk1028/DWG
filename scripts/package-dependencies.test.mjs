import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import test from "node:test";

const workspaceRoots = ["apps", "packages", "modules"];
const allowedDependencies = {
  "apps/workspace": ["@dwg/contracts"],
  "modules/cad-document": ["@dwg/contracts"],
  "modules/cad-edit": ["@dwg/contracts", "@dwg/cad-document"],
  "modules/cad-query": ["@dwg/contracts"],
  "modules/cad-export": ["@dwg/contracts", "@dwg/cad-document", "@dwg/cad-edit"],
  "modules/cad-io-acadsharp": ["@dwg/contracts", "@dwg/cad-edit"],
  "modules/cad-capabilities": [
    "@dwg/contracts",
    "@dwg/cad-document",
    "@dwg/cad-edit",
    "@dwg/cad-query",
    "@dwg/cad-export",
    "@dwg/cad-io-acadsharp"
  ],
  "modules/skill-runtime": [
    "@dwg/contracts",
    "@dwg/skill-contracts",
    "@dwg/cad-capabilities"
  ],
  "packages/test-kit": ["@dwg/contracts"],
  "packages/skill-contracts": ["@dwg/contracts"],
  "packages/contracts": []
};

test("workspace packages declare only their planned @dwg dependencies", async () => {
  for (const workspace of await findWorkspacePackages()) {
    const expected = allowedDependencies[workspace.path];
    assert.ok(expected, `workspace ${workspace.path} is missing a dependency policy`);

    const actual = Object.keys(workspace.manifest.dependencies ?? {})
      .filter((dependency) => dependency.startsWith("@dwg/"))
      .sort();
    assert.deepEqual(actual, [...expected].sort(), workspace.path);
  }
});

test("workspace packages never depend on root-owned cad-runtime", async () => {
  for (const workspace of await findWorkspacePackages()) {
    for (const dependency of Object.keys(workspace.manifest.dependencies ?? {})) {
      assert.notEqual(dependency, "@dwg/cad-runtime", workspace.path);
    }
  }
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
