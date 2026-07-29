import assert from "node:assert/strict";
import { chdir, cwd } from "node:process";
import test from "node:test";

import {
  createRepositoryPaths,
  findRepositoryRoot
} from "../../src/platform/repositoryPaths.js";

test("repository paths do not depend on process.cwd", () => {
  const original = cwd();
  try {
    chdir(process.env.TEMP ?? "C:\\Windows\\Temp");
    const root = findRepositoryRoot(import.meta.url);
    const paths = createRepositoryPaths(root);
    assert.match(paths.parserProject, /modules[\\/]dwg-parser[\\/]src/);
    assert.match(paths.defaultDrawing, /tests[\\/]fixtures[\\/]dwg/);
  } finally {
    chdir(original);
  }
});
