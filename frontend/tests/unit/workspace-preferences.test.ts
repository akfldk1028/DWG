import assert from "node:assert/strict";
import test from "node:test";

import {
  clampArtifactWidth,
  createWorkspacePreferencesStore,
  defaultWorkspacePreferences,
  resolveTheme
} from "../../src/app/workspacePreferences.js";

test("resolves explicit and system theme preferences", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("clamps the CAD artifact width while preserving the conversation", () => {
  assert.equal(clampArtifactWidth(1440, 900, true), 835);
  assert.equal(clampArtifactWidth(1440, 300, true), 520);
  assert.equal(clampArtifactWidth(1200, 1000, false), 833);
});

test("workspace preferences persist and reject malformed storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  };
  const store = createWorkspacePreferencesStore(storage);

  assert.deepEqual(store.load(), defaultWorkspacePreferences);
  store.save({
    theme: "dark",
    artifactWidth: 720,
    sidebarSections: {
      project: false,
      drawing: true,
      sessions: true
    }
  });
  assert.equal(store.load().theme, "dark");
  assert.equal(store.load().artifactWidth, 720);

  values.set("dwg.workspace-preferences.v1", "{\"theme\":\"invalid\"}");
  assert.deepEqual(store.load(), defaultWorkspacePreferences);
});

test("workspace preference storage failures preserve usable defaults", () => {
  const store = createWorkspacePreferencesStore({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    }
  });

  assert.deepEqual(store.load(), defaultWorkspacePreferences);
  assert.doesNotThrow(() => store.save(defaultWorkspacePreferences));
});
