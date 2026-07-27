import assert from "node:assert/strict";
import test from "node:test";

import { createProviderSessionStore } from "../../src/features/agent-chat/providerSessionStore";

const codexSession = "98d84d53-7861-4c73-a789-d6c8f5490966";
const claudeSession = "d74c21e8-97c7-4e2a-b1aa-59f4a06db21a";

class MemoryStorage {
  value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }

  removeItem() {
    this.value = null;
  }
}

test("persists provider sessions independently", () => {
  const storage = new MemoryStorage();
  const store = createProviderSessionStore(storage);

  store.set("codex", codexSession);
  store.set("claude", claudeSession);

  assert.equal(store.get("codex"), codexSession);
  assert.equal(store.get("claude"), claudeSession);
});

test("ignores malformed persisted data and clears all sessions", () => {
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    codex: "not-a-session",
    claude: claudeSession,
    unknown: codexSession
  });
  const store = createProviderSessionStore(storage);

  assert.equal(store.get("codex"), null);
  assert.equal(store.get("claude"), claudeSession);

  store.clear();
  assert.equal(storage.value, null);
});

test("storage failures do not break chat state", () => {
  const store = createProviderSessionStore({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    }
  });

  assert.equal(store.get("codex"), null);
  assert.doesNotThrow(() => store.set("codex", codexSession));
  assert.doesNotThrow(() => store.clear());
});
