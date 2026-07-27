import { createOAuthOnlyEnvironment } from "../cli/oauthEnvironment.js";
import { defaultProcessRunner } from "../cli/processRunner.js";
import { join } from "node:path";
import type {
  ChatProvider,
  ProcessRunner,
  ProviderChatRequest,
  ProviderChatResult,
  ProviderStatus
} from "../contracts.js";

export class CodexCliProvider implements ChatProvider {
  readonly id = "codex" as const;

  constructor(
    private readonly runner: ProcessRunner = defaultProcessRunner,
    private readonly cwd = process.cwd(),
    command?: string
  ) {
    const launch = resolveCodexLaunch(command);
    this.command = launch.command;
    this.prefixArgs = launch.prefixArgs;
  }

  private readonly command: string;
  private readonly prefixArgs: string[];

  async getStatus(): Promise<ProviderStatus> {
    let result;
    try {
      result = await this.runner.run({
        command: this.command,
        args: [...this.prefixArgs, "login", "status"],
        cwd: this.cwd,
        env: createOAuthOnlyEnvironment(),
        timeoutMs: 15_000
      });
    } catch {
      result = { exitCode: null, stdout: "", stderr: "", errorCode: "ENOENT" };
    }
    const output = `${result.stdout}\n${result.stderr}`;
    const authenticated = result.exitCode === 0 && /logged in using chatgpt/i.test(output);

    return {
      id: this.id,
      label: "GPT · Codex",
      installed: result.errorCode !== "ENOENT",
      authenticated,
      authMethod: authenticated ? "chatgpt" : "unknown",
      detail: authenticated
        ? "기존 ChatGPT 로그인 세션"
        : "Codex login unavailable; run codex login"
    };
  }

  async chat(request: ProviderChatRequest): Promise<ProviderChatResult> {
    const result = await this.runner.run({
      command: this.command,
      args: [
        ...this.prefixArgs,
        "--ask-for-approval",
        "never",
        "exec",
        "--json",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-C",
        this.cwd,
        "-"
      ],
      cwd: this.cwd,
      env: createOAuthOnlyEnvironment(),
      stdin: buildPrompt(request),
      timeoutMs: 180_000
    });
    if (result.exitCode !== 0) {
      throw new Error(`Codex provider failed: ${safeFailure(result.errorCode)}`);
    }

    let text = "";
    let sessionId: string | null = null;
    for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        sessionId = event.thread_id;
      }
      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string"
      ) {
        text += event.item.text;
      }
    }
    if (!text.trim()) throw new Error("Codex provider returned no assistant text");
    return { provider: this.id, text: text.trim(), sessionId };
  }
}

function resolveCodexLaunch(command?: string) {
  if (command) return { command, prefixArgs: [] as string[] };
  if (process.platform === "win32" && process.env.APPDATA) {
    return {
      command: process.execPath,
      prefixArgs: [
        join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js")
      ]
    };
  }
  return { command: "codex", prefixArgs: [] as string[] };
}

function buildPrompt(request: ProviderChatRequest) {
  return [
    request.systemPrompt,
    "",
    "<cad_context>",
    request.context,
    "</cad_context>",
    "",
    "<user_request>",
    request.message,
    "</user_request>"
  ].join("\n");
}

function safeFailure(errorCode?: string) {
  return errorCode === "ENOENT" ? "CLI not installed" : "CLI execution error";
}
