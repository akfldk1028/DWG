import { expect, test } from "@playwright/test";
import { documentationCapturePath } from "../support/repositoryOutputPaths.ts";

test("saves a verified drawing copy and downloads a report", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Choose destination" }).click();
  await page.getByLabel("Base filename").fill("verified-copy");
  await page.getByRole("button", { name: "Save As DXF" }).click();
  await expect(page.getByRole("status")).toContainText("Verified");
  await expect(page.getByText("Destination grant used — choose again for another copy")).toBeVisible();
  await page.screenshot({
    path: documentationCapturePath("save-verified.png"),
    fullPage: true
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON report" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/u);
  await expect(page.getByRole("status")).toContainText("Report ready");
  await page.screenshot({
    path: documentationCapturePath("export-report.png"),
    fullPage: true
  });
});
