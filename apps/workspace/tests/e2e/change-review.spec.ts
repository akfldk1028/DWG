import { expect, test, type Page } from "@playwright/test";

import {
  parseCadEditApplyResponse,
  parseCadEditPreviewRequest,
  parseCadEditPreviewResponse,
  type CadEditApplyResponse,
  type CadEditBatch,
  type CadEditPreviewResponse
} from "@dwg/contracts";

const documentId = "dwg:b60b4a7242e43b34ca35561b";
const previewId = "10000000-0000-4000-8000-000000000001";

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
  const previewedBatches: CadEditBatch[] = [];
  let stale = false;
  await mockInspection(page);
  await mockEditGateway(page, calls, applyBodies, previewedBatches, () => stale);
  await page.goto("/");

  await selectGroundedEntity(page);
  const changes = page.getByRole("tab", { name: "Changes" });
  await expect(changes).toBeVisible();
  await changes.click();
  await expect(page.getByText("Selected handle 239")).toBeVisible();
  await page.getByLabel("Move X").fill("5");
  await page.getByRole("button", { name: "Preview move" }).click();

  const review = page.getByRole("region", { name: "Change review" });
  await expect(review).toContainText("Revision 0 → 1");
  await expect(page.getByRole("heading", { name: "Entity changes" })).toContainText("1 change");
  await expect(review.getByText("HANDLE", { exact: true }).first()).toBeVisible();
  await expect(review.getByText("0", { exact: true }).first()).toBeVisible();
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
  expect(previewedBatches).toHaveLength(3);
  expect(previewedBatches[0]).toMatchObject({
    documentId,
    expectedRevision: 0,
    commands: [{
      expectedRevision: 0,
      preconditions: [
        { target: "239", field: "type", equals: "LWPOLYLINE" },
        { target: "239", field: "layer", equals: "0" }
      ],
      operation: { kind: "entity.move", handles: ["239"], delta: [5, 0, 0] }
    }]
  });
  expect(applyBodies).toEqual([
    { previewId, documentId, expectedRevision: 0, approved: true },
    { previewId, documentId, expectedRevision: 0, approved: true }
  ]);
});

test("retries an initial preview failure from the retained product proposal", async ({ page }) => {
  let attempts = 0;
  await mockInspection(page);
  await page.route("**/api/edit/preview", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "EDIT_UNAVAILABLE", message: "Preview temporarily unavailable." } })
      });
    }
    const batch = parseCadEditPreviewRequest(route.request().postDataJSON()).batch;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(previewResponse(batch)) });
  });
  await page.goto("/");
  await selectGroundedEntity(page);
  await page.getByRole("tab", { name: "Changes" }).click();
  await page.getByLabel("Move X").fill("1");
  await page.getByRole("button", { name: "Preview move" }).click();

  await expect(page.getByRole("alert")).toContainText("Preview temporarily unavailable.");
  await expect(page.getByRole("button", { name: "Retry preview" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("status")).toContainText("Ready for approval");
  expect(attempts).toBe(2);
});

test("rejects uncorrelated preview apply and history responses before updating state", async ({ page }) => {
  let previewBatch: CadEditBatch | null = null;
  let previewMismatch = true;
  let applyMismatch = true;
  let historyMismatch = true;
  await mockInspection(page);
  await page.route("**/api/edit/preview", (route) => {
    previewBatch = parseCadEditPreviewRequest(route.request().postDataJSON()).batch;
    const response = previewResponse(previewBatch);
    if (previewMismatch) response.documentId = "dwg:other";
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.route("**/api/edit/apply", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(applyResponse(
      1,
      previewBatch!,
      applyMismatch ? "dwg:other" : documentId
    ))
  }));
  await page.route("**/api/edit/undo", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(applyResponse(
      historyMismatch ? 8 : 2,
      previewBatch!,
      documentId
    ))
  }));
  await page.goto("/");
  await selectGroundedEntity(page);
  await page.getByRole("tab", { name: "Changes" }).click();
  await page.getByLabel("Move X").fill("2");
  await page.getByRole("button", { name: "Preview move" }).click();
  await expect(page.getByRole("alert")).toContainText("Preview response does not match proposal.");
  await expect(page.getByText("Ready for approval")).toHaveCount(0);

  previewMismatch = false;
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("status")).toContainText("Ready for approval");
  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Apply response does not match reviewed changes.");
  await expect(page.getByText("Applied at revision 1")).toHaveCount(0);

  applyMismatch = false;
  await page.getByRole("button", { name: "Retry apply" }).click();
  await expect(page.getByRole("status")).toContainText("Applied at revision 1");
  await page.getByRole("button", { name: "Undo changes" }).click();
  await expect(page.getByRole("alert")).toContainText("History response does not match reviewed changes.");
  await expect(page.getByText("Undone at revision 8")).toHaveCount(0);

  historyMismatch = false;
  await page.getByRole("button", { name: "Retry undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undone at revision 2");
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

test("bounds a contract-valid oversized evidence handle", async ({ page }) => {
  const oversizedHandle = "H".repeat(500);
  await mockInspection(page);
  await page.route("**/api/edit/preview", (route) => {
    const batch = parseCadEditPreviewRequest(route.request().postDataJSON()).batch;
    const response = previewResponse(batch);
    const change = response.changes[0]!;
    if (change.kind !== "entity.move" || !change.before) throw new Error("Expected entity move evidence");
    change.before.handle = oversizedHandle;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/");
  await selectGroundedEntity(page);
  await page.getByRole("tab", { name: "Changes" }).click();
  await page.getByLabel("Move X").fill("3");
  await page.getByRole("button", { name: "Preview move" }).click();

  const handleValue = page.locator(".change-evidence dd").filter({ hasText: /^H+/ }).first();
  await expect(handleValue).toHaveText(`${"H".repeat(159)}…`);
  await expect(page.getByText(oversizedHandle, { exact: true })).toHaveCount(0);
});

async function publishProposal(page: Page, batch: CadEditBatch) {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("dwg:cad-edit-proposal/v1", { detail })), batch);
}

async function mockEditGateway(
  page: Page,
  calls: { preview: number; apply: number; undo: number; redo: number },
  applyBodies: unknown[],
  previewedBatches: CadEditBatch[],
  isStale: () => boolean
) {
  await page.route("**/api/edit/preview", (route) => {
    calls.preview += 1;
    const batch = parseCadEditPreviewRequest(route.request().postDataJSON()).batch;
    previewedBatches.push(batch);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(previewResponse(batch)) });
  });
  await page.route("**/api/edit/apply", (route) => {
    calls.apply += 1;
    applyBodies.push(route.request().postDataJSON());
    if (isStale()) {
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({
        error: { code: "EDIT_PREVIEW_STALE", message: "Preview is stale." }
      }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(1, previewedBatches.at(-1)!)) });
  });
  await page.route("**/api/edit/undo", (route) => {
    calls.undo += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(2, previewedBatches.at(-1)!)) });
  });
  await page.route("**/api/edit/redo", (route) => {
    calls.redo += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(applyResponse(3, previewedBatches.at(-1)!)) });
  });
}

function previewResponse(batch: CadEditBatch): CadEditPreviewResponse {
  return parseCadEditPreviewResponse({
    previewId,
    documentId: batch.documentId,
    transactionId: batch.transactionId,
    baseRevision: batch.expectedRevision,
    nextRevision: batch.expectedRevision + 1,
    changeCount: 1,
    changesTruncated: false,
    changes: [
      {
        commandId: batch.commands[0]!.commandId,
        kind: "entity.move",
        targetId: "h:239",
        before: { id: "h:239", handle: "239", type: "LWPOLYLINE", layer: "0", bbox: { min: [0, 0, 0], max: [10, 10, 0] }, text: null },
        after: { id: "h:239", handle: "239", type: "LWPOLYLINE", layer: "0", bbox: { min: [5, 0, 0], max: [15, 10, 0] }, text: null }
      }
    ],
    warningCount: 2,
    warningsTruncated: true,
    warnings: ["Warning 1 of 2"]
  });
}

function applyResponse(revision: number, batch: CadEditBatch, responseDocumentId = batch.documentId): CadEditApplyResponse {
  return parseCadEditApplyResponse({
    documentId: responseDocumentId,
    revision,
    transactionId: batch.transactionId,
    changeCount: 1
  });
}

async function mockInspection(page: Page) {
  await page.route("**/api/inspections", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      status: "completed",
      drawingId: documentId,
      events: [],
      findings: [{
        id: "h:239",
        handle: "239",
        type: "LWPOLYLINE",
        layer: "0",
        bbox: { min: [0, 0, 0], max: [10, 10, 0] },
        reason: "layer:0",
        confidence: 1
      }],
      issues: [],
      warnings: []
    })
  }));
}

async function selectGroundedEntity(page: Page) {
  await page.getByRole("button", { name: "Run agents" }).click();
  await page.getByRole("tab", { name: /Findings/ }).click();
  await page.locator(".finding-group-heading").click();
  await page.locator(".finding-row").click();
}
