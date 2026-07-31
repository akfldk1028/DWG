import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
});

test("uses the assembled export capability endpoint and separates report export from drawing Save As", async ({ page }) => {
  const capabilityStatus = await page.evaluate(async () => {
    const response = await fetch("/api/export/capabilities");
    return response.status;
  });
  expect(capabilityStatus).toBe(200);

  await page.getByRole("tab", { name: "Export", exact: true }).click();
  const panel = page.getByRole("region", { name: "Export" });
  await expect(panel.getByRole("heading", { name: "Report export" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Drawing Save As" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Download.*DWG/i })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Choose destination" })).toBeVisible();
  await expect(panel.getByLabel("Base filename")).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Destination required");
});

test("keeps a 500 pixel conversation and exposes both keyboard resizers at 1280 by 800", async ({ page }) => {
  const conversation = page.getByRole("main", { name: "대화" });
  await expect(conversation).toBeVisible();
  expect((await conversation.boundingBox())!.width).toBeGreaterThanOrEqual(500);

  const sidebar = page.getByRole("separator", { name: "Sidebar width" });
  const artifact = page.locator(".artifact-resizer");
  await expect(sidebar).toHaveAttribute("tabindex", "0");
  await expect(artifact).toHaveAttribute("tabindex", "0");
  await sidebar.press("ArrowRight");
  await artifact.press("ArrowLeft");
  expect((await conversation.boundingBox())!.width).toBeGreaterThanOrEqual(500);
});
