import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  documentationCaptureDirectory,
  e2eArtifactPath,
  oauthArtifactPath
} from "../support/repositoryOutputPaths.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("workspace-generated visual outputs resolve from the repository root", () => {
  assert.equal(
    documentationCaptureDirectory,
    resolve(repositoryRoot, "docs/ui-captures")
  );
  assert.equal(
    oauthArtifactPath("codex"),
    resolve(
      repositoryRoot,
      "tests/visual/test-results/live-oauth/oauth-codex-persistent-browser-e2e.png"
    )
  );
  assert.equal(
    e2eArtifactPath("loaded-1440x900.png"),
    resolve(
      repositoryRoot,
      "tests/visual/test-results/e2e-artifacts/loaded-1440x900.png"
    )
  );
});
