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

const drawingPath = "tests/fixtures/dwg/export_sample.dwg";

export function useProviderChat() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("codex");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ProviderChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestController = useRef<AbortController | null>(null);

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
    requestController.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await sendProviderChat({
        provider: selectedProvider,
        drawingPath,
        message: trimmedMessage
      }, controller.signal);
      setResult(response);
      setMessage("");
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "AI 응답에 실패했습니다.");
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
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
    submit
  };
}
