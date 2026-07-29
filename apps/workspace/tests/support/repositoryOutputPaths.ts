import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(workspaceRoot, "../..");

export const documentationCaptureDirectory = resolve(
  repositoryRoot,
  "docs/ui-captures"
);

export const e2eArtifactDirectory = resolve(
  repositoryRoot,
  "tests/visual/test-results/e2e-artifacts"
);

export function e2eArtifactPath(fileName: string) {
  return resolve(e2eArtifactDirectory, fileName);
}

export function oauthArtifactPath(provider: "codex" | "claude") {
  return resolve(
    repositoryRoot,
    `tests/visual/test-results/live-oauth/oauth-${provider}-persistent-browser-e2e.png`
  );
}
