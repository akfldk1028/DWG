export type ProviderId = "codex" | "claude";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  installed: boolean;
  authenticated: boolean;
  authMethod: "chatgpt" | "claude.ai" | "unknown";
  subscription?: string;
  detail: string;
}

export interface ProviderChatRequest {
  message: string;
  systemPrompt: string;
  context: string;
}

export interface ProviderChatResult {
  provider: ProviderId;
  text: string;
  sessionId: string | null;
}

export interface ChatProvider {
  readonly id: ProviderId;
  getStatus(): Promise<ProviderStatus>;
  chat(request: ProviderChatRequest): Promise<ProviderChatResult>;
}

export interface ProcessRunSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
}

export interface ProcessRunner {
  run(spec: ProcessRunSpec): Promise<ProcessResult>;
}
