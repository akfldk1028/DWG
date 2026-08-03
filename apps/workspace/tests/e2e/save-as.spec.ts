import { expect, test } from "@playwright/test";

// Known defect: Save As only verifies against a trivial DXF source. Against the
// repository default drawing (tests/fixtures/dwg/export_sample.dwg) the source
// index, the ACadSharp writer, and the reopened output disagree on the entity
// count (234 / 455 / 69), so verifyCounts in
// modules/cad-capabilities/src/outputVerification.ts raises
// CAD_SAVE_VERIFICATION_FAILED; saving as DWG raises CAD_SAVE_REOPEN_FAILED.
// Reproduce with: npm run test:e2e -- --drawing tests/fixtures/dwg/export_sample.dwg save-as
test.fixme("saves a verified drawing copy and downloads a report", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Choose destination" }).click();
  await page.getByLabel("Base filename").fill("verified-copy");
  await page.getByRole("button", { name: "Save As DXF" }).click();
  await expect(page.getByRole("status")).toContainText("Verified");
  await expect(page.getByText("Destination grant used — choose again for another copy")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("save-verified.png"),
    fullPage: true
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON report" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/u);
  await expect(page.getByRole("status")).toContainText("Report ready");
  await page.screenshot({
    path: testInfo.outputPath("export-report.png"),
    fullPage: true
  });
});
