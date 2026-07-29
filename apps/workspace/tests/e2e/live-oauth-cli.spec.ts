import { expect, test, type Page } from "@playwright/test";
import { oauthArtifactPath } from "../support/repositoryOutputPaths.ts";

const providerCases = [
  { id: "codex", buttonName: "GPT" },
  { id: "claude", buttonName: "Claude" }
] as const;

const requestedProvider = process.env.DWG_LIVE_PROVIDER ?? "all";
const selectedProviders = providerCases.filter(
  ({ id }) => requestedProvider === "all" || requestedProvider === id
);

if (selectedProviders.length === 0) {
  throw new Error(
    `DWG_LIVE_PROVIDER must be all, codex, or claude; received ${requestedProvider}`
  );
}

test.describe.configure({ mode: "serial", timeout: 300_000 });

for (const provider of selectedProviders) {
  test(`${provider.id} browser gateway resumes the authenticated CLI session`, async ({
    page,
    request
  }) => {
    const healthResponse = await request.get("/api/health");
    expect(healthResponse.ok(), await healthResponse.text()).toBe(true);

    const drawingResponse = await request.get("/api/drawing");
    expect(drawingResponse.ok(), await drawingResponse.text()).toBe(true);

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    const providerButton = page.getByRole("button", {
      name: provider.buttonName,
      exact: true
    });
    await expect(providerButton).toBeEnabled({ timeout: 30_000 });
    await providerButton.click();

    const firstSessionId = await submitAndReadSession(
      page,
      "List one TEXT or MTEXT object from the indexed drawing and cite its [handle:...]."
    );

    await page.reload();
    await expect(providerButton).toBeEnabled({ timeout: 30_000 });
    await providerButton.click();

    const resumedSessionId = await submitAndReadSession(
      page,
      "Continue the same session and repeat the first cited CAD handle."
    );

    expect(resumedSessionId).toBe(firstSessionId);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: oauthArtifactPath(provider.id),
      fullPage: true
    });
  });
}

async function submitAndReadSession(page: Page, message: string) {
  const composer = page.getByRole("textbox", { name: "AI 질문" });
  await composer.fill(message);
  await page.getByRole("button", { name: "전송" }).click();

  const response = page.getByTestId("live-response");
  await expect(response).toContainText(/\[handle:[0-9A-F]+\]/i, {
    timeout: 240_000
  });
  const sessionId = await response.locator("code").textContent();
  expect(sessionId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  return sessionId;
}
