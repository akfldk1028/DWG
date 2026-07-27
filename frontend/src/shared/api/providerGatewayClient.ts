import type {
  ProviderChatPayload,
  ProviderChatResult,
  ProviderStatus
} from "../types";
import { getJson, postJson } from "./httpClient";

interface ProviderStatusResponse {
  providers: ProviderStatus[];
}

export async function loadProviderStatuses(signal?: AbortSignal) {
  const response = await getJson<ProviderStatusResponse>("/api/providers", signal);
  return response.providers;
}

export function sendProviderChat(request: ProviderChatPayload, signal?: AbortSignal) {
  return postJson<ProviderChatResult>("/api/chat", request, signal);
}
