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
      specifier: "../../../frontend/src/shared/types"
    },
    {
      importer: "agent/src/application/chat/chatService.ts",
      specifier: "../../../../frontend/src/shared/types"
    },
    {
      importer: "frontend/src/shared/api/providerGatewayClient.ts",
      specifier: "../../../../agent/src/providers/contracts"
    },
    {
      importer: "frontend/src/shared/types.ts",
      specifier: "../features/agent-chat/useProviderChat"
    },
    {
      importer: "frontend/src/features/cad-viewer/CadViewer.tsx",
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
  assert.deepEqual(root.workspaces, ["apps/*", "packages/*"]);
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
