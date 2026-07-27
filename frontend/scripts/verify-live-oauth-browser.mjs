import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const artifactPath = resolve(
  "../tests/visual/artifacts/oauth-codex-persistent-browser-e2e.png"
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  colorScheme: "light",
  viewport: { width: 1440, height: 900 }
});
page.setDefaultTimeout(240_000);
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(baseUrl);
  const codexButton = page.locator(".provider-switch button").first();
  await codexButton.click();

  const composer = page.locator(".composer input:not([type=file])");
  await composer.fill(
    "List one TEXT or MTEXT object from the indexed drawing and cite its [handle:...]."
  );
  await page.locator(".composer .send-button").click();
  const response = page.getByTestId("live-response");
  await response.waitFor();
  const firstText = await response.textContent();
  assert.match(firstText ?? "", /\[handle:[0-9A-F]+\]/i);
  const firstSessionId = await response.locator("code").textContent();
  assert.match(
    firstSessionId ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );

  await page.reload();
  await page.locator(".provider-switch button").first().click();
  await composer.fill(
    "Continue the same session and repeat the first cited CAD handle."
  );
  await page.locator(".composer .send-button").click();
  await response.waitFor();
  const resumedText = await response.textContent();
  assert.match(resumedText ?? "", /\[handle:[0-9A-F]+\]/i);
  const resumedSessionId = await response.locator("code").textContent();
  assert.equal(resumedSessionId, firstSessionId);
  assert.deepEqual(consoleErrors, []);

  await mkdir(resolve(artifactPath, ".."), { recursive: true });
  await page.screenshot({ path: artifactPath, fullPage: true });
  process.stdout.write(JSON.stringify({
    provider: "codex",
    sessionId: firstSessionId,
    resumedSessionId,
    screenshot: artifactPath,
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
}
