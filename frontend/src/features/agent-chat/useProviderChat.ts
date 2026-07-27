import { useEffect, useRef, useState } from "react";

import {
  loadProviderStatuses,
  sendProviderChat
} from "../../shared/api/providerGatewayClient";
import type {
  ProviderChatResult,
  ProviderId,
  ProviderStatus
} from "../../shared/types";
import {
  browserProviderSessionStore,
  type ProviderSessionStore
} from "./providerSessionStore";

const drawingPath = "tests/fixtures/dwg/export_sample.dwg";

export function useProviderChat(
  sessionStore: ProviderSessionStore = browserProviderSessionStore
) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("codex");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ProviderChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestController = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    loadProviderStatuses(controller.signal)
      .then((statuses) => {
        setProviders(statuses);
        setSelectedProvider((current) => {
          if (statuses.some((provider) => provider.id === current && provider.authenticated)) {
            return current;
          }
          return statuses.find((provider) => provider.authenticated)?.id ?? current;
        });
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setError("로컬 AI gateway에 연결할 수 없습니다.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => requestController.current?.abort(), []);

  async function submit() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) return;

    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    requestController.current = controller;
    setLoading(true);
    setError(null);
    try {
      const sessionId = sessionStore.get(selectedProvider);
      const response = await sendProviderChat({
        provider: selectedProvider,
        drawingPath,
        message: trimmedMessage,
        ...(sessionId ? { sessionId } : {})
      }, controller.signal);
      if (
        controller.signal.aborted ||
        requestGeneration.current !== generation
      ) return;
      if (response.sessionId) {
        sessionStore.set(selectedProvider, response.sessionId);
      }
      setResult(response);
      setMessage("");
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "AI 응답에 실패했습니다.");
    } finally {
      if (
        requestController.current === controller &&
        requestGeneration.current === generation
      ) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }

  function cancel() {
    requestGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setLoading(false);
  }

  function reset() {
    cancel();
    setMessage("");
    setResult(null);
    setError(null);
    sessionStore.clear();
  }

  return {
    providers,
    selectedProvider,
    setSelectedProvider,
    message,
    setMessage,
    result,
    error,
    loading,
    submit,
    cancel,
    reset
  };
}
