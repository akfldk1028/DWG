import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/providers", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ providers: [] })
    })
  );
});

test("uses readable conversation typography", async ({ page }) => {
  await page.goto("/");

  const promptSize = await page.locator(".conversation-empty span").evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize)
  );
  const composerSize = await page.getByLabel("AI 질문").evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize)
  );

  expect(promptSize).toBeGreaterThanOrEqual(12);
  expect(composerSize).toBeGreaterThanOrEqual(13);
});

test("completed inspection removes the empty prompt and groups findings", async ({ page }) => {
  await mockInspection(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Run agents" }).click();

  await expect(page.locator(".conversation-empty")).toHaveCount(0);
  await expect(page.locator(".tool-step").first()).toContainText("PLANNED");

  await page.getByRole("tab", { name: /Findings/ }).click();
  await expect(page.locator(".finding-group")).toHaveCount(2);
  await expect(page.locator(".finding-row")).toHaveCount(0);

  await page.getByRole("button", { name: /LWPOLYLINE.*1/ }).click();
  await expect(page.locator(".finding-row")).toHaveCount(1);
  await expect(page.locator(".finding-row")).toContainText("handle 239");
});

test("layer visibility reports visible and total model entities", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-visibility-button").first().click();

  await expect(page.locator(".viewer-status")).toContainText("0 visible / 22 total");
});

test("drawing tree scroll area does not disappear behind Sessions", async ({ page }) => {
  await page.goto("/");

  const layer = await page.locator(".layer-row").first().boundingBox();
  const sessions = await page.getByRole("button", { name: "Sessions", exact: true }).boundingBox();
  expect(layer).not.toBeNull();
  expect(sessions).not.toBeNull();
  expect(layer!.y + layer!.height).toBeLessThanOrEqual(sessions!.y);
});

async function mockInspection(page: Page) {
  await page.route("**/api/inspections", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        drawingId: "dwg:test",
        events: [
          { sequence: 1, agentId: "orchestrator", action: "plan", status: "planned" },
          { sequence: 2, agentId: "drawing-index-agent", action: "build-index", status: "completed" },
          { sequence: 3, agentId: "orchestrator", action: "complete", status: "completed" }
        ],
        findings: [
          {
            id: "h:239",
            handle: "239",
            type: "LWPOLYLINE",
            layer: "0",
            bbox: { min: [0, 0, 0], max: [10, 10, 0] },
            reason: "layer:0",
            confidence: 1
          },
          {
            id: "h:23A",
            handle: "23A",
            type: "LINE",
            layer: "0",
            bbox: { min: [0, 0, 0], max: [10, 10, 0] },
            reason: "layer:0",
            confidence: 1
          }
        ],
        issues: [],
        warnings: []
      })
    })
  );
}
