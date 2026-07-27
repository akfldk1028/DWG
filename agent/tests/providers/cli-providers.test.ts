import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthOnlyEnvironment } from "../../src/providers/cli/oauthEnvironment.js";
import { ClaudeCliProvider } from "../../src/providers/claude/claudeCliProvider.js";
import { CodexCliProvider } from "../../src/providers/codex/codexCliProvider.js";
import type {
  ProcessResult,
  ProcessRunSpec,
  ProcessRunner
} from "../../src/providers/contracts.js";

class FakeRunner implements ProcessRunner {
  readonly calls: ProcessRunSpec[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(spec: ProcessRunSpec): Promise<ProcessResult> {
    this.calls.push(spec);
    const result = this.results.shift();
    if (!result) throw new Error("Unexpected process invocation");
    return result;
  }
}

const ok = (stdout: string): ProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: ""
});

test("OAuth-only environment strips application API credentials", () => {
  const environment = createOAuthOnlyEnvironment({
    PATH: "C:\\tools",
    OPENAI_API_KEY: "openai-secret",
    ANTHROPIC_API_KEY: "anthropic-secret",
    SOME_SAFE_VALUE: "keep"
  });

  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.ANTHROPIC_API_KEY, undefined);
  assert.equal(environment.SOME_SAFE_VALUE, "keep");
  assert.equal(environment.PATH, "C:\\tools");
});

test("Codex adapter detects ChatGPT login and normalizes JSONL output", async () => {
  const runner = new FakeRunner([
    ok("Logged in using ChatGPT\n"),
    ok([
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "핸들 23D는 LINE입니다." }
      }),
      JSON.stringify({ type: "turn.completed" })
    ].join("\n"))
  ]);
  const provider = new CodexCliProvider(runner, "C:\\DK\\DWG", "codex");

  const status = await provider.getStatus();
  const result = await provider.chat({
    message: "도형을 설명해줘",
    systemPrompt: "CAD 근거만 사용",
    context: "h:23D LINE"
  });

  assert.equal(status.authenticated, true);
  assert.equal(status.authMethod, "chatgpt");
  assert.equal(result.text, "핸들 23D는 LINE입니다.");
  assert.equal(result.sessionId, "thread-1");
  assert.deepEqual(runner.calls[1]?.args.slice(0, 5), [
    "--ask-for-approval",
    "never",
    "exec",
    "--json",
    "--ephemeral"
  ]);
  assert.equal(runner.calls[1]?.stdin?.includes("h:23D LINE"), true);
});

test("Claude adapter detects subscription login and normalizes JSON output", async () => {
  const runner = new FakeRunner([
    ok(JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      subscriptionType: "max"
    })),
    ok(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "개요표 텍스트를 확인했습니다.",
      session_id: "session-1"
    }))
  ]);
  const provider = new ClaudeCliProvider(runner, "C:\\DK\\DWG", "claude");

  const status = await provider.getStatus();
  const result = await provider.chat({
    message: "개요표를 읽어줘",
    systemPrompt: "CAD 근거만 사용",
    context: "TEXT: Hello"
  });

  assert.equal(status.authenticated, true);
  assert.equal(status.authMethod, "claude.ai");
  assert.equal(result.text, "개요표 텍스트를 확인했습니다.");
  assert.equal(result.sessionId, "session-1");
  assert.equal(runner.calls[1]?.args.includes("--permission-mode"), true);
  assert.equal(runner.calls[1]?.args.includes("plan"), true);
  assert.equal(runner.calls[1]?.args.includes("--tools"), true);
  assert.equal(runner.calls[1]?.args.includes(""), true);
});

test("provider adapters surface sanitized CLI failures", async () => {
  const runner = new FakeRunner([
    { exitCode: 1, stdout: "", stderr: "token abc123 failed" }
  ]);
  const provider = new CodexCliProvider(runner, "C:\\DK\\DWG", "codex");

  const status = await provider.getStatus();

  assert.equal(status.authenticated, false);
  assert.match(status.detail, /login unavailable/i);
  assert.doesNotMatch(status.detail, /abc123/);
});
