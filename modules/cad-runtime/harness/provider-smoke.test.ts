import assert from "node:assert/strict";
import test from "node:test";

import { createProviderSmokeSummary } from "./provider-smoke-summary.js";

test("provider smoke summary exposes only safe status fields", () => {
  const secrets = {
    sessionId: "SESSION_SECRET_SENTINEL",
    response: "RESPONSE_SECRET_SENTINEL",
    resumedResponse: "RESUMED_RESPONSE_SECRET_SENTINEL",
    prompt: "PROMPT_SECRET_SENTINEL",
    environment: "ENVIRONMENT_SECRET_SENTINEL"
  };
  const summary = createProviderSmokeSummary({
    provider: "claude",
    authMethod: "oauth",
    subscription: "max",
    resumed: true,
    ...secrets
  });
  const output = JSON.stringify(summary);

  assert.deepEqual(summary, {
    provider: "claude",
    authMethod: "oauth",
    subscription: "max",
    resumed: true
  });
  for (const secret of Object.values(secrets)) {
    assert.equal(output.includes(secret), false);
  }
});
