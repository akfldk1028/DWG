import {
  isProviderSessionId,
  type ProviderId
} from "@dwg/contracts";

const storageKey = "dwg.provider-sessions.v1";

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProviderSessionStore {
  get(provider: ProviderId): string | null;
  set(provider: ProviderId, sessionId: string): void;
  clear(): void;
}

export function createProviderSessionStore(
  storage: SessionStorageLike
): ProviderSessionStore {
  function read(): Partial<Record<ProviderId, string>> {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};

      const record = parsed as Record<string, unknown>;
      return {
        ...(isProviderSessionId(record.codex) ? { codex: record.codex } : {}),
        ...(isProviderSessionId(record.claude) ? { claude: record.claude } : {})
      };
    } catch {
      return {};
    }
  }

  return {
    get(provider) {
      return read()[provider] ?? null;
    },
    set(provider, sessionId) {
      if (!isProviderSessionId(sessionId)) return;
      try {
        storage.setItem(storageKey, JSON.stringify({
          ...read(),
          [provider]: sessionId
        }));
      } catch {
        // Browsers may deny session storage in restricted contexts.
      }
    },
    clear() {
      try {
        storage.removeItem(storageKey);
      } catch {
        // Reset remains safe when storage access is denied.
      }
    }
  };
}

const browserStorage: SessionStorageLike = {
  getItem(key) {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  }
};

export const browserProviderSessionStore =
  createProviderSessionStore(browserStorage);
