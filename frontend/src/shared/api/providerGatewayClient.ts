import type {
  ProviderChatResult,
  ProviderId,
  ProviderStatus
} from "../types";
import { getJson, postJson } from "./httpClient";

interface ProviderStatusResponse {
  providers: ProviderStatus[];
}

interface ProviderChatRequest {
  provider: ProviderId;
  drawingPath: string;
  message: string;
  sessionId?: string;
}

export async function loadProviderStatuses(signal?: AbortSignal) {
  const response = await getJson<ProviderStatusResponse>("/api/providers", signal);
  return response.providers;
}

export function sendProviderChat(request: ProviderChatRequest, signal?: AbortSignal) {
  return postJson<ProviderChatResult>("/api/chat", request, signal);
}
