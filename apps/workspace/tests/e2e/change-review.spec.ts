import { expect, test, type Page } from "@playwright/test";

import {
  parseCadEditApplyResponse,
  parseCadEditBatch,
  parseCadEditPreviewResponse,
  type CadEditApplyResponse,
  type CadEditBatch,
  type CadEditPreviewResponse
} from "@dwg/contracts";

const documentId = "dwg:b60b4a7242e43b34ca35561b";
const previewId = "10000000-0000-4000-8000-000000000001";
const transactionId = "20000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/providers", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ providers: [] })
  }));
});

test("reviews bounded typed changes, rejects without applying, and re-previews stale work", async ({ page }) => {
  const calls = { preview: 0, apply: 0, undo: 0, redo: 0 };
  const applyBodies: unknown[] = [];
  let stale = false;
  await mockEditGateway(page, calls, applyBodies, () => stale);
  await page.goto("/");

  await publishProposal(page, validBatch());
  const changes = page.getByRole("tab", { name: "Changes" });
  await expect(changes).toBeVisible();
  await changes.click();

  const review = page.getByRole("region", { name: "Change review" });
  await expect(review).toContainText("Revision 0 → 1");
  await expect(page.getByRole("heading", { name: "Layer changes" })).toContainText("1 change");
  await expect(page.getByRole("heading", { name: "Entity changes" })).toContainText("1 change");
  await expect(review.getByText("HANDLE", { exact: true }).first()).toBeVisible();
  await expect(review.getByText("A-WALL", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Warning 1 of 2")).toBeVisible();
  await expect(page.getByText("1 additional warning not shown")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject changes" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Approve changes" })).toBeEnabled();

  await page.getByRole("button", { name: "Reject changes" }).click();
  await expect(page.getByRole("status")).toContainText("Changes rejected");
  expect(calls.apply).toBe(0);

  await page.getByRole("button", { name: "Re-preview changes" }).click();
  await expect(page.getByRole("button", { name: "Approve changes" })).toBeEnabled();
  stale = true;
  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Preview is stale");
  await expect(page.getByRole("button", { name: "Re-preview changes" })).toBeEnabled();

  stale = false;
  await page.getByRole("button", { name: "Re-preview changes" }).click();
  await page.getByRole("button", { name: "Approve changes" }).dblclick();
  await expect(page.getByRole("status")).toContainText("Applied at revision 1");
  await expect(page.getByRole("button", { name: "Undo changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo changes" }).click();
  await expect(page.getByRole("status")).toContainText("Undone at revision 2");
  await page.getByRole("button", { name: "Redo changes" }).click();
  await expect(page.getByRole("status")).toContainText("Redone at revision 3");
  expect(calls).toEqual({ preview: 3, apply: 2, undo: 1, redo: 1 });
  expect(applyBodies).toEqual([
    { previewId, documentId, expectedRevision: 0, approved: true },
    { previewId, documentId, expectedRevision: 0, approved: true }
  ]);
});

test("ignores malformed proposal events and keeps the error bounded", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("dwg:cad-edit-proposal/v1", {
    detail: { documentId: "not-a-batch", commands: [] }
  })));
  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid CAD edit proposal.");
  await expect(page.getByText("No proposed changes to review.")).toBeVisible();
});

async function publishProposal(page: Page, batch: CadEditBatch) {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("dwg:cad-edit-proposal/v1", { detail })), batch);
}

async function mockEditGateway(
  page: Page,
  calls: { preview: number; apply: number; undo: number; redo: number },
  applyBodies: unknown[],
  isStale: () => boolean
) {
  await page.route("**/api/edit/preview", (route) => {
    calls.preview += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(previewResponse()) });
  });
  await page.route("**/api/edit/apply", (route) => {
    calls.apply += 1;
    applyBodies.push(route.request().postDataJSON());
    if (isStale()) {
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({
        error: { code: "EDIT_PREVIEW_STALE", message: "Preview is stale." }
      }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(1)) });
  });
  await page.route("**/api/edit/undo", (route) => {
    calls.undo += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(2)) });
  });
  await page.route("**/api/edit/redo", (route) => {
    calls.redo += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(3)) });
  });
}

function validBatch(): CadEditBatch {
  return parseCadEditBatch({
    schemaVersion: "cad-edit/v1",
    transactionId,
    documentId,
    expectedRevision: 0,
    commands: [{
      commandId: "30000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      origin: { kind: "user", id: "review-test" },
      preconditions: [{ target: "layer:imported:A-WALL", field: "exists", equals: true }],
      operation: { kind: "layer.update", layerId: "layer:imported:A-WALL", visible: false }
    }]
  });
}

function previewResponse(): CadEditPreviewResponse {
  return parseCadEditPreviewResponse({
    previewId,
    documentId,
    transactionId,
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
    warningCount: 2,
    warningsTruncated: true,
    warnings: ["Warning 1 of 2"]
  });
}

function applyResponse(revision: number): CadEditApplyResponse {
  return parseCadEditApplyResponse({ documentId, revision, transactionId, changeCount: 2 });
}
