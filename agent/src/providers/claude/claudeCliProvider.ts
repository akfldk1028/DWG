import { createOAuthOnlyEnvironment } from "../cli/oauthEnvironment.js";
import { defaultProcessRunner } from "../cli/processRunner.js";
import type {
  ChatProvider,
  ProcessRunner,
  ProviderChatRequest,
  ProviderChatResult,
  ProviderStatus
} from "../contracts.js";

export class ClaudeCliProvider implements ChatProvider {
  readonly id = "claude" as const;

  constructor(
    private readonly runner: ProcessRunner = defaultProcessRunner,
    private readonly cwd = process.cwd(),
    private readonly command = "claude"
  ) {}

  async getStatus(): Promise<ProviderStatus> {
    let result;
    try {
      result = await this.runner.run({
        command: this.command,
        args: ["auth", "status", "--json"],
        cwd: this.cwd,
        env: createOAuthOnlyEnvironment(),
        timeoutMs: 15_000
      });
    } catch {
      result = { exitCode: null, stdout: "", stderr: "", errorCode: "ENOENT" };
    }
    let status: any = null;
    try {
      status = JSON.parse(result.stdout);
    } catch {
      status = null;
    }
    const authenticated =
      result.exitCode === 0 &&
      status?.loggedIn === true &&
      status?.authMethod === "claude.ai";

    return {
      id: this.id,
      label: "Claude",
      installed: result.errorCode !== "ENOENT",
      authenticated,
      authMethod: authenticated ? "claude.ai" : "unknown",
      subscription:
        authenticated && typeof status.subscriptionType === "string"
          ? status.subscriptionType
          : undefined,
      detail: authenticated
        ? `기존 Claude 로그인 세션${status.subscriptionType ? ` · ${status.subscriptionType}` : ""}`
        : "Claude login unavailable; run claude auth login"
    };
  }

  async chat(request: ProviderChatRequest): Promise<ProviderChatResult> {
    const result = await this.runner.run({
      command: this.command,
      args: [
        "--print",
        "--output-format",
        "json",
        "--permission-mode",
        "plan",
        "--tools",
        "",
        "--no-session-persistence"
      ],
      cwd: this.cwd,
      env: createOAuthOnlyEnvironment(),
      stdin: buildPrompt(request),
      timeoutMs: 180_000
    });
    if (result.exitCode !== 0) {
      throw new Error(`Claude provider failed: ${safeFailure(result.errorCode)}`);
    }

    let output: any;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      throw new Error("Claude provider returned invalid JSON");
    }
    if (output.subtype !== "success" || typeof output.result !== "string") {
      throw new Error("Claude provider returned no assistant text");
    }
    return {
      provider: this.id,
      text: output.result.trim(),
      sessionId: typeof output.session_id === "string" ? output.session_id : null
    };
  }
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
