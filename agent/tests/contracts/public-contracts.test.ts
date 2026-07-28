import assert from "node:assert/strict";
import test from "node:test";

import {
  isInspectionPayload,
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

test("public inspection contract accepts only bounded path-free checks", () => {
  assert.equal(isInspectionPayload({
    checks: [{ kind: "layer", value: "0" }]
  }), true);
  assert.equal(isInspectionPayload({
    checks: [{ kind: "text", value: "ROOM-[0-9]+", regex: true }]
  }), true);
  assert.equal(isInspectionPayload({
    checks: Array.from({ length: 9 }, () => ({ kind: "layer", value: "0" }))
  }), false);
  assert.equal(isInspectionPayload({
    path: "../../secret.dwg",
    checks: [{ kind: "layer", value: "0" }]
  }), false);
  assert.equal(isInspectionPayload({
    checks: [{ kind: "layer", value: "0", regex: true }]
  }), false);
});
