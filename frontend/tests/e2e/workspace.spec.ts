import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const artifacts = resolve("../tests/visual/artifacts");
const indexFixture = JSON.parse(readFileSync(
  fileURLToPath(
    new URL("../../public/data/export_sample.index.json", import.meta.url)
  ),
  "utf8"
)) as {
  summary: { modelSpaceCount: number };
  layers: Array<{ name: string; entityCount: number }>;
  entities: Array<{ layout: string; layer: string }>;
  unsupported: unknown[];
};
const modelEntityCount = indexFixture.summary.modelSpaceCount;
const visibleDefaultLayerCount = indexFixture.entities.filter(
  (entity) => entity.layout === "Model" && entity.layer === "0"
).length;
const defaultLayerEntityCount = indexFixture.layers.find(
  (layer) => layer.name === "0"
)!.entityCount;
const inspectionWarningCount = indexFixture.unsupported.length + 1;

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
    maxDiffPixelRatio: 0
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

test("serves the application favicon without a missing-resource error", async ({ request }) => {
  const response = await request.get("/favicon.svg");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
});

for (const viewport of [
  { name: "loaded-1280x800", width: 1280, height: 800 },
  { name: "loaded-1440x900", width: 1440, height: 900 },
  { name: "loaded-1920x1080", width: 1920, height: 1080 }
]) {
  test(`${viewport.name} real DWG workspace`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockProviderStatus(page);
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto("/");

    await expect(page.getByText("export_sample.dwg", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("CAD 뷰어")).toBeVisible();
    await expect(page.locator(".cad-entity")).toHaveCount(modelEntityCount);
    await expect(page.getByText("Drawing Index", { exact: true })).toBeVisible();
    const findingEmptyBox = await page.getByText("Run agents를 눌러 실제 도면 검사를 실행하세요.").boundingBox();
    const evidenceBox = await page.getByTestId("evidence-card").boundingBox();
    expect(findingEmptyBox).not.toBeNull();
    expect(evidenceBox).not.toBeNull();
    expect(Math.abs(findingEmptyBox!.y - evidenceBox!.y)).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
    await assertWorkspaceFits(page);
    await capture(page, viewport.name);
  });
}

test("real agent run exposes grounded findings, evidence, and warnings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Run agents" }).click();
  await expect(page.getByText("VERIFIED RESULT")).toBeVisible();
  await expect(page.getByText(
    `${defaultLayerEntityCount}개 주요 객체`
  )).toBeVisible();
  await expect(page.locator(".cad-entity.highlighted"))
    .toHaveCount(visibleDefaultLayerCount);
  await capture(page, "real-inspection-1440x900");
  await page.screenshot({
    path: resolve(artifacts, "geometry-inspection-1440x900.png"),
    fullPage: true
  });

  await page.locator(".finding-row").click();
  await expect(page.getByTestId("evidence-card")).toContainText("239");
  await expect(page.locator('[data-handle="239"]')).toHaveClass(/highlighted/);
  await capture(page, "finding-evidence-1440x900");

  await page.getByRole("button", { name: /Warnings/ }).click();
  await expect(page.locator(".warning-card"))
    .toHaveCount(inspectionWarningCount);
  await expect(page.locator(".warning-card").first())
    .toContainText("unsupported-entities-present");
  await capture(page, "geometry-warning-1440x900");
  await assertWorkspaceFits(page);
});

test("switches OAuth provider and renders a grounded response", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  const chatRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/chat", async (route) => {
    const request = route.request().postDataJSON();
    chatRequests.push(request);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "claude",
        text: "TEXT Hello를 확인했습니다. [handle:591]",
        sessionId: "98d84d53-7861-4c73-a789-d6c8f5490966"
      })
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await page.getByLabel("AI 질문").fill("도면의 텍스트를 알려줘");
  await page.getByRole("button", { name: "전송" }).click();

  await expect(page.getByTestId("live-response")).toContainText("Hello");
  await expect(page.getByTestId("live-response")).toContainText("[handle:591]");
  await expect(page.getByText("CLAUDE · OAUTH", { exact: true })).toBeVisible();
  await page.getByLabel("AI 질문").fill("앞 질문에 이어서 설명해줘");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByTestId("live-response")).toContainText("Hello");
  expect(chatRequests).toHaveLength(2);
  expect(chatRequests[0]).toEqual({
    provider: "claude",
    drawingPath: "tests/fixtures/dwg/export_sample.dwg",
    message: "도면의 텍스트를 알려줘"
  });
  expect(chatRequests[1]).toEqual({
    provider: "claude",
    drawingPath: "tests/fixtures/dwg/export_sample.dwg",
    message: "앞 질문에 이어서 설명해줘",
    sessionId: "98d84d53-7861-4c73-a789-d6c8f5490966"
  });
  const responseBox = await page.getByTestId("live-response").boundingBox();
  const composerBox = await page.locator(".composer").boundingBox();
  expect(responseBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(responseBox!.y + responseBox!.height).toBeLessThanOrEqual(composerBox!.y);
  await capture(page, "oauth-claude-response-1440x900");
  await assertWorkspaceFits(page);
});

test("cancels an in-flight OAuth provider request from the composer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  let releaseResponse!: () => void;
  await page.route("**/api/chat", async (route) => {
    await new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "codex",
        text: "too late",
        sessionId: "cancelled-session"
      })
    });
  });
  await page.goto("/");

  await page.getByLabel("AI 질문").fill("긴 분석을 취소해줘");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByRole("button", { name: "응답 취소" })).toBeVisible();
  await page.getByRole("button", { name: "응답 취소" }).click();

  await expect(page.getByLabel("AI 질문")).toBeEnabled({ timeout: 1_000 });
  await expect(page.getByRole("button", { name: "응답 취소" })).toBeHidden({ timeout: 1_000 });
  await expect(page.getByTestId("live-response")).toHaveCount(0);
  releaseResponse();
  await page.waitForTimeout(50);
  await expect(page.getByTestId("live-response")).toHaveCount(0);
});

test("workspace controls change visible state instead of remaining inert", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProviderStatus(page);
  await page.goto("/");

  await page.getByRole("button", { name: "알림" }).click();
  await expect(page.getByRole("status")).toContainText("새 알림이 없습니다");

  await page.getByRole("button", { name: "설정" }).click();
  await expect(page.getByRole("dialog", { name: "뷰어 설정" })).toBeVisible();

  await page.getByRole("button", { name: "도면 검색", exact: true }).click();
  await page.getByLabel("레이어 검색").fill("control");
  await expect(page.locator(".layer-row")).toHaveCount(1);

  await page.getByLabel("전체 도면 검색").fill("239");
  await expect(page.locator(".cad-entity.highlighted")).toHaveCount(1);

  await page.getByRole("button", { name: "그리드" }).click();
  await expect(page.getByRole("button", { name: "그리드" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".cad-grid")).toHaveCount(0);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByTestId("cad-canvas")).toHaveAttribute("data-view", "fit");

  await page.getByRole("button", { name: "최대화" }).click();
  await expect(page.getByLabel("CAD 뷰어")).toHaveClass(/viewer-maximized/);
  await page.getByRole("button", { name: "최대화 종료" }).click();
  await expect(page.getByLabel("CAD 뷰어")).not.toHaveClass(/viewer-maximized/);

  await page.getByRole("button", { name: "Evidence", exact: false }).click();
  await expect(page.getByTestId("evidence-card")).toBeVisible();
  await page.getByRole("button", { name: "Warnings", exact: false }).click();
  await expect(page.getByText("경고가 없습니다.")).toBeVisible();

  await page.getByLabel("AI 질문").fill("기존 질문");
  await page.getByRole("button", { name: "새 대화" }).click();
  await expect(page.getByLabel("AI 질문")).toHaveValue("");
  await page.getByRole("button", { name: "에이전트 멘션" }).click();
  await expect(page.getByLabel("AI 질문")).toHaveValue("@drawing-index-agent ");
  await page.getByLabel("첨부 파일 선택").setInputFiles({
    name: "review-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("check handle 239")
  });
  await expect(page.locator(".attachment-chip")).toContainText("review-note.txt");
  await expect(page.getByLabel("AI 질문")).toHaveValue(/check handle 239/);
  await page.getByRole("button", { name: "첨부 제거" }).click();
  await expect(page.locator(".attachment-chip")).toHaveCount(0);
  await expect(page.getByLabel("AI 질문")).toHaveValue("@drawing-index-agent");

  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.getByLabel("에이전트 워크스페이스")).toBeHidden();
  await page.getByRole("button", { name: "패널 열기" }).click();
  await expect(page.getByLabel("에이전트 워크스페이스")).toBeVisible();
});
