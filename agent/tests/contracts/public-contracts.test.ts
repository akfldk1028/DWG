import assert from "node:assert/strict";
import test from "node:test";

import {
  isProviderChatPayload,
  isProviderSessionId
} from "@dwg/contracts";

test("public provider contract accepts only bounded UUID sessions", () => {
  assert.equal(
    isProviderSessionId("019fa2d0-2534-7691-b50e-875340b7e3a5"),
    true
  );
  assert.equal(isProviderSessionId("--last"), false);
  assert.equal(isProviderChatPayload({
    provider: "codex",
    drawingPath: "drawing.dwg",
    message: "도면 설명",
    sessionId: "019fa2d0-2534-7691-b50e-875340b7e3a5"
  }), true);
  assert.equal(isProviderChatPayload({
    provider: "other",
    drawingPath: "drawing.dwg",
    message: "도면 설명"
  }), false);
});
