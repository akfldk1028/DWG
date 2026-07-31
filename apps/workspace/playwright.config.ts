import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { e2eExportRoot } from "./tests/support/repositoryOutputPaths.js";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(workspaceRoot, "../..");
const frontendPort = Number(process.env.DWG_FRONTEND_PORT ?? 4173);
const gatewayPort = Number(process.env.DWG_GATEWAY_PORT ?? 4317);
process.env.DWG_EXPORT_MODE = "e2e";

export default defineConfig({
  globalSetup: "./tests/support/exportRootGlobalSetup.ts",
  testDir: "./tests/e2e",
  testIgnore: "**/live-oauth-cli.spec.ts",
  outputDir: resolve(repositoryRoot, "tests/visual/test-results"),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run gateway",
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DWG_GATEWAY_PORT: String(gatewayPort),
        DWG_EXPORT_MODE: "e2e",
        DWG_EXPORT_ROOT: e2eExportRoot,
        DWG_DRAWING_PATH: process.env.DWG_DRAWING_PATH ?? "tests/fixtures/dxf/minimal-architectural.dxf"
      },
      url: `http://127.0.0.1:${gatewayPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: "npm run dev",
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DWG_FRONTEND_PORT: String(frontendPort),
        DWG_GATEWAY_PORT: String(gatewayPort)
      },
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 60_000
    }
  ],
  reporter: [["list"]]
});
