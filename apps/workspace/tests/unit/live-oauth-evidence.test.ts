import assert from "node:assert/strict";
import test from "node:test";

import {
  createSafeLiveOAuthSummary,
  renderSafeLiveOAuthEvidence
} from "../support/liveOAuthEvidence.js";

test("live OAuth evidence excludes prompts, responses, and provider session IDs", () => {
  const prompt = "PROMPT_SECRET_SENTINEL";
  const response = "RESPONSE_SECRET_SENTINEL";
  const sessionId = "SESSION_SECRET_SENTINEL";
  const summary = createSafeLiveOAuthSummary({
    provider: "codex",
    authenticated: true,
    firstSessionId: sessionId,
    resumedSessionId: sessionId,
    prompt,
    response
  });
  const rendered = renderSafeLiveOAuthEvidence(summary);

  assert.deepEqual(summary, {
    provider: "Codex",
    authenticated: true,
    resumed: true
  });
  for (const secret of [prompt, response, sessionId]) {
    assert.equal(JSON.stringify(summary).includes(secret), false);
    assert.equal(rendered.includes(secret), false);
  }
});
