import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCadEditBatch, parseCadEditPreviewResponse } from "@dwg/contracts";
import {
  documentationCaptureDirectory,
  documentationCapturePath
} from "../support/repositoryOutputPaths.ts";

const captureDirectory = documentationCaptureDirectory;

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
  await page.getByRole("tab", { name: /Findings/ }).click();
  await capture(page, "02-inspection-complete.png");

  await page.getByRole("button", { name: "검사 초기화" }).click();
  await page.getByRole("tab", { name: /CAD Preview/ }).click();
  const layerToggle = page.locator(".layer-visibility-button").first();
  await layerToggle.click();
  await expect(layerToggle).toHaveAccessibleName("Show layer 0");
  await capture(page, "03-layer-hidden.png");

  await page.reload();
  await stabilize(page);
  const claudeButton = page.getByRole("button", { name: "Claude", exact: true });
  await expect(claudeButton).toBeEnabled();
  await claudeButton.click();
  await expect(claudeButton).toHaveClass(/active/);
  await page.getByLabel("AI 질문").fill("도면의 TEXT 객체를 근거와 함께 알려줘");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByTestId("live-response")).toContainText("[handle:591]");
  await capture(page, "04-claude-selected.png");

  await page.getByRole("button", { name: "설정" }).click();
  await page.getByLabel("테마").selectOption("dark");
  await expect(page.getByTestId("cad-canvas")).toHaveCSS("background-color", "rgb(23, 26, 28)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "뷰어 설정" })).toBeHidden();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await capture(page, "05-dark-theme.png");
});

test("renders a single overview contact sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(
    pathToFileURL(documentationCapturePath("index.html")).toString()
  );
  await expect(page.locator("img")).toHaveCount(5);
  await expect(page.locator("img").last()).toBeVisible();
  await page.screenshot({
    path: documentationCapturePath("00-overview.png"),
    fullPage: true,
    animations: "disabled"
  });
});

test("captures the focused desktop sidebar preference state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  await page.goto("/");

  const resizer = page.getByRole("separator", { name: "Sidebar width" });
  await expect(resizer).toHaveAttribute("aria-valuenow", "320");
  await resizer.press("ArrowRight");
  await expect(resizer).toHaveAttribute("aria-valuenow", "336");
  await capture(page, "sidebar-preferences.png");
});

test("captures populated change review at desktop and narrow widths", async ({ page }) => {
  await mkdir(captureDirectory, { recursive: true });
  await page.route("**/api/edit/preview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(capturePreview())
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await publishCaptureProposal(page);
  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.getByRole("region", { name: "Change review" })).toContainText("Layer changes");
  await stabilize(page);
  await capture(page, "change-review-desktop.png");

  await page.setViewportSize({ width: 800, height: 700 });
  await page.reload();
  await page.locator(".artifact-toggle").click();
  await publishCaptureProposal(page);
  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.getByRole("region", { name: "Change review" })).toContainText("Entity changes");
  await stabilize(page);
  await capture(page, "change-review-narrow.png");
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
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "claude",
        text: "TEXT Hello를 확인했습니다. [handle:591]",
        sessionId: "98d84d53-7861-4c73-a789-d6c8f5490966"
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
    path: documentationCapturePath(fileName),
    fullPage: true,
    animations: "disabled"
  });
}

async function publishCaptureProposal(page: Page) {
  const batch = parseCadEditBatch({
    schemaVersion: "cad-edit/v1",
    transactionId: "20000000-0000-4000-8000-000000000001",
    documentId: "dwg:b60b4a7242e43b34ca35561b",
    expectedRevision: 0,
    commands: [{
      commandId: "30000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      origin: { kind: "user", id: "documentation-capture" },
      preconditions: [{ target: "layer:imported:A-WALL", field: "exists", equals: true }],
      operation: { kind: "layer.update", layerId: "layer:imported:A-WALL", visible: false }
    }]
  });
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("dwg:cad-edit-proposal/v1", { detail })), batch);
}

function capturePreview() {
  return parseCadEditPreviewResponse({
    previewId: "10000000-0000-4000-8000-000000000001",
    documentId: "dwg:b60b4a7242e43b34ca35561b",
    transactionId: "20000000-0000-4000-8000-000000000001",
    baseRevision: 0,
    nextRevision: 1,
    changeCount: 2,
    changesTruncated: false,
    changes: [
      {
        commandId: "30000000-0000-4000-8000-000000000001",
        kind: "layer.update",
        targetId: "layer:imported:A-WALL",
        before: { id: "layer:imported:A-WALL", name: "A-WALL", color: 7, visible: true, frozen: false, locked: false },
        after: { id: "layer:imported:A-WALL", name: "A-WALL", color: 7, visible: false, frozen: false, locked: false }
      },
      {
        commandId: "30000000-0000-4000-8000-000000000001",
        kind: "text.replace",
        targetId: "h:1A",
        before: { id: "h:1A", handle: "1A", type: "TEXT", layer: "A-WALL", bbox: { min: [0, 0, 0], max: [1, 1, 0] }, text: "Before" },
        after: { id: "h:1A", handle: "1A", type: "TEXT", layer: "A-WALL", bbox: { min: [0, 0, 0], max: [1, 1, 0] }, text: "After" }
      }
    ],
    warningCount: 1,
    warningsTruncated: false,
    warnings: ["Source text review required."]
  });
}
