import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  findModuleBoundaryViolations,
  scanWorkspaceModuleBoundaries
} from "../../src/architecture/moduleBoundaryChecker.js";

test("rejects imports that bypass public and feature boundaries", () => {
  const violations = findModuleBoundaryViolations([
    {
      importer: "packages/contracts/src/cad.ts",
      specifier: "../../../apps/workspace/src/shared/types"
    },
    {
      importer: "modules/cad-runtime/src/application/chat/chatService.ts",
      specifier: "../../../../../apps/workspace/src/shared/types"
    },
    {
      importer: "apps/workspace/src/shared/api/providerGatewayClient.ts",
      specifier: "../../../../../modules/cad-runtime/src/providers/contracts"
    },
    {
      importer: "apps/workspace/src/shared/types.ts",
      specifier: "../features/agent-chat/useProviderChat"
    },
    {
      importer: "apps/workspace/src/features/cad-viewer/CadViewer.tsx",
      specifier: "../agent-chat/useProviderChat"
    }
  ]);

  assert.deepEqual(
    violations.map((violation) => violation.rule),
    [
      "contracts-are-runtime-independent",
      "agent-does-not-import-frontend",
      "frontend-does-not-import-agent",
      "frontend-shared-does-not-import-features",
      "frontend-features-do-not-cross-import"
    ]
  );
});

test("current workspace respects enforced module boundaries", async () => {
  const violations = await scanWorkspaceModuleBoundaries(process.cwd());

  assert.deepEqual(violations, []);
});

test("repository exposes explicit application and module roots", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.deepEqual(root.workspaces, ["apps/*", "packages/*"]);
  assert.equal(
    Object.keys(lock.packages).some(
      (packagePath) => /^frontend(?:\/|$)/.test(packagePath)
    ),
    false
  );
  await access("apps/workspace/package.json");
  await access("modules/cad-runtime/src");
  await access("modules/dwg-parser/src");
  await assert.rejects(() => access("frontend"));
  await assert.rejects(() => access("agent"));
  await assert.rejects(() => access("backend"));
});

test("active setup documentation installs workspaces from the root", async () => {
  const setupDocs = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("docs/architecture/ai-clone-handoff.md", "utf8")
  ]);

  for (const setupDoc of setupDocs) {
    assert.match(setupDoc, /npm install/);
    assert.doesNotMatch(setupDoc, /npm --prefix frontend install/);
  }
});
