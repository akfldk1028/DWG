import assert from "node:assert/strict";
import test from "node:test";

import { createProviderGateway } from "../../src/http/providerGateway.js";

test("loopback gateway exposes health, provider status, and grounded chat", async (context) => {
  const server = createProviderGateway({
    getStatuses: async () => [
      {
        id: "codex",
        label: "GPT · Codex",
        installed: true,
        authenticated: true,
        authMethod: "chatgpt",
        detail: "기존 ChatGPT 로그인 세션"
      }
    ],
    chat: async (request) => ({
      provider: request.provider,
      text: "근거 응답 [handle:23D]",
      sessionId: "thread-1"
    })
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, service: "dwg-provider-gateway" });

  const providers = await fetch(`${baseUrl}/api/providers`).then((response) => response.json());
  assert.equal(providers.providers[0].authMethod, "chatgpt");

  const chatResponse = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "codex",
      drawingPath: "tests/fixtures/dwg/export_sample.dwg",
      message: "이 도형을 설명해줘"
    })
  });
  assert.equal(chatResponse.status, 200);
  assert.equal((await chatResponse.json()).text, "근거 응답 [handle:23D]");
});

test("gateway rejects oversized or malformed requests without invoking chat", async (context) => {
  let calls = 0;
  const server = createProviderGateway({
    getStatuses: async () => [],
    chat: async () => {
      calls += 1;
      throw new Error("should not run");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const malformed = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
});
