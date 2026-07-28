import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const captureDirectory = resolve("../docs/ui-captures");

test.describe.configure({ mode: "serial" });

test("captures the single workspace route in its key states", async ({ page }) => {
  await mkdir(captureDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  await page.goto("/");
  await expect(page.getByText("export_sample.dwg", { exact: true }).first()).toBeVisible();
  await stabilize(page);
  await capture(page, "01-workspace-loaded.png");

  await page.getByRole("button", { name: "Run agents" }).click();
  await expect(page.getByText("VERIFIED RESULT")).toBeVisible();
  await capture(page, "02-inspection-complete.png");

  await page.getByRole("button", { name: "Loaded" }).click();
  const layerToggle = page.locator(".layer-visibility-button").first();
  await layerToggle.click();
  await expect(layerToggle).toHaveAccessibleName("0 레이어 표시");
  await capture(page, "03-layer-hidden.png");

  await page.reload();
  const claudeButton = page.getByRole("button", { name: "Claude", exact: true });
  await expect(claudeButton).toBeEnabled();
  await claudeButton.click();
  await expect(claudeButton).toHaveClass(/active/);
  await capture(page, "04-claude-selected.png");
});

test("renders a single overview contact sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(
    pathToFileURL(resolve(captureDirectory, "index.html")).toString()
  );
  await expect(page.locator("img")).toHaveCount(4);
  await expect(page.locator("img").last()).toBeVisible();
  await page.screenshot({
    path: resolve(captureDirectory, "00-overview.png"),
    fullPage: true
  });
});

async function mockProviderStatus(page: Page) {
  await page.route("**/api/providers", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          {
            id: "codex",
            label: "GPT · Codex",
            installed: true,
            authenticated: true,
            authMethod: "chatgpt",
            detail: "기존 ChatGPT 로그인 세션"
          },
          {
            id: "claude",
            label: "Claude",
            installed: true,
            authenticated: true,
            authMethod: "claude.ai",
            subscription: "max",
            detail: "기존 Claude 로그인 세션 · max"
          }
        ]
      })
    })
  );
}

async function stabilize(page: Page) {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
  });
}

async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: resolve(captureDirectory, fileName),
    fullPage: true
  });
}
