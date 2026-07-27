import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve("../tests/visual/artifacts");

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
  });
}

async function capture(page: Page, name: string) {
  await stabilize(page);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01
  });
}

async function assertWorkspaceFits(page: Page) {
  const result = await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>("header, nav, aside, main, section, button")];
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const offenders = all
      .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1 || rect.left < -1 || rect.top < -1)
      .map(({ label }) => label);
    return {
      bodyOverflow: document.documentElement.scrollWidth > viewport.width || document.documentElement.scrollHeight > viewport.height,
      offenders
    };
  });
  expect(result).toEqual({ bodyOverflow: false, offenders: [] });
}

for (const viewport of [
  { name: "loaded-1280x800", width: 1280, height: 800 },
  { name: "loaded-1440x900", width: 1440, height: 900 },
  { name: "loaded-1920x1080", width: 1920, height: 1080 }
]) {
  test(`${viewport.name} real DWG workspace`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByText("export_sample.dwg", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("CAD 뷰어")).toBeVisible();
    await expect(page.locator(".cad-entity")).toHaveCount(22);
    await expect(page.getByText("Drawing Index", { exact: true })).toBeVisible();
    await assertWorkspaceFits(page);
    await capture(page, viewport.name);
  });
}

test("agent run, highlight, evidence, and warning states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "Run agents" }).click();
  await expect(page.getByText("RUNNING")).toBeVisible();
  await capture(page, "agent-running-1440x900");

  await page.getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator(".cad-entity.highlighted")).toHaveCount(4);
  await expect(page.getByText("VERIFIED RESULT")).toBeVisible();
  await capture(page, "layer-highlighted-1440x900");

  await page.getByRole("button", { name: /0 레이어 주요 형상 확인/ }).click();
  await expect(page.getByTestId("evidence-card")).toContainText("23D");
  await expect(page.locator('[data-handle="23D"]')).toHaveClass(/highlighted/);
  await capture(page, "finding-evidence-1440x900");

  await page.getByRole("button", { name: "Warning", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("bbox-not-implemented");
  await capture(page, "unsupported-warning-1440x900");
  await assertWorkspaceFits(page);
});
