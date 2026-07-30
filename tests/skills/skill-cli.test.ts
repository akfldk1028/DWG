import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

test("skill CLI runs a declared skill and prints only one bounded safe summary", async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), "skill-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const input = resolve(directory, "input.json");
  await writeFile(input, JSON.stringify({ path: "tests/fixtures/dxf/minimal-architectural.dxf", layer: "A-WALL" }));

  const result = await invoke("--skill", "inspect-drawing", "--input", input);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(summary).sort(), ["changeCount", "hasPreview", "skillId", "status", "warningCount"]);
  assert.deepEqual(summary, { skillId: "inspect-drawing", status: "passed", changeCount: 0, warningCount: 0, hasPreview: false });
  assert.doesNotMatch(result.stdout, /minimal-architectural|matches|[A-Za-z]:[\\/]/i);
});

test("skill CLI uses a distinct usage exit code and does not print raw failures", async () => {
  const result = await invoke("--unknown");
  assert.equal(result.code, 2);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  assert.deepEqual(JSON.parse(result.stdout), { skillId: "unknown", status: "failed", changeCount: 0, warningCount: 1, hasPreview: false });
  assert.doesNotMatch(result.stderr, /secret|snapshot|path/i);
});

function invoke(...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "modules/cad-runtime/harness/run-skill.ts", ...args], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}
