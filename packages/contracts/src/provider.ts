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

export interface ProviderChatPayload {
  provider: ProviderId;
  drawingPath: string;
  message: string;
  sessionId?: string | null;
}

export interface ProviderChatResult {
  provider: ProviderId;
  text: string;
  sessionId: string | null;
}

export function isProviderSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isProviderChatPayload(value: unknown): value is ProviderChatPayload {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    (request.provider === "codex" || request.provider === "claude") &&
    typeof request.drawingPath === "string" &&
    request.drawingPath.length > 0 &&
    typeof request.message === "string" &&
    request.message.length > 0 &&
    (
      request.sessionId === undefined ||
      request.sessionId === null ||
      isProviderSessionId(request.sessionId)
    )
  );
}
