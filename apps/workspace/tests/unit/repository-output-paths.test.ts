import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  documentationCaptureDirectory,
  e2eArtifactPath,
  oauthArtifactPath,
  resolveOwnedFile
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

test("owned output paths allow normal and nested filenames", () => {
  assert.equal(
    resolveOwnedFile("C:/owned-output", "capture.png"),
    resolve("C:/owned-output", "capture.png")
  );
  assert.equal(
    resolveOwnedFile("C:/owned-output", "nested/capture.png"),
    resolve("C:/owned-output", "nested/capture.png")
  );
});

test("owned output paths reject traversal and absolute filenames", () => {
  const root = "C:/owned-output";

  for (const fileName of [
    "../capture.png",
    "nested/../../capture.png",
    "C:\\outside\\capture.png",
    "/outside/capture.png"
  ]) {
    assert.throws(
      () => resolveOwnedFile(root, fileName),
      /owned output directory/i
    );
  }
});
