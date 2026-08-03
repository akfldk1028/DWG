import { expect, test } from "@playwright/test";

test("saves a verified drawing copy and downloads a report", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Choose destination" }).click();
  await page.getByLabel("Base filename").fill("verified-copy");
  await page.getByRole("button", { name: "Save As DWG" }).click();
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

test("withholds DXF drawing export instead of offering an unverifiable copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  const dxf = page.getByRole("button", { name: "Save As DXF" });
  await expect(dxf).toBeDisabled();
  await expect(dxf).toHaveAttribute(
    "title",
    "DXF drawing export is withheld for a DWG source because the copy cannot be verified against it."
  );

  await page.getByRole("button", { name: "Choose destination" }).click();
  await expect(page.getByRole("button", { name: "Save As DWG" })).toBeEnabled();
  await expect(dxf).toBeDisabled();

  const rejected = await page.evaluate(async () => {
    const grant = await fetch("/api/export/destination-grants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    }).then((response) => response.json());
    const response = await fetch("/api/export/drawings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        documentId: "dwg:unused",
        expectedRevision: 0,
        destinationGrantId: grant.grantId,
        baseFilename: "direct-call",
        format: "dxf",
        version: "AC1032"
      })
    });
    return { status: response.status, body: await response.json() };
  });
  expect(rejected.status).toBe(409);
  expect(rejected.body.error.code).toBe("EXPORT_UNSUPPORTED");
});
