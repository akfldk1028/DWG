export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface WorkspacePreferences {
  theme: ThemePreference;
  artifactWidth: number;
  sidebarSections: {
    project: boolean;
    drawing: boolean;
    sessions: boolean;
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = "dwg.workspace-preferences.v1";
const sidebarWidth = 238;
const conversationMinimumWidth = 360;
const separatorWidth = 7;
const artifactMinimumWidth = 520;

export const defaultWorkspacePreferences: WorkspacePreferences = {
  theme: "system",
  artifactWidth: 760,
  sidebarSections: {
    project: true,
    drawing: true,
    sessions: true
  }
};

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

export function clampArtifactWidth(
  viewportWidth: number,
  desiredWidth: number,
  sidebarVisible: boolean
) {
  const availableWidth =
    viewportWidth -
    (sidebarVisible ? sidebarWidth : 0) -
    conversationMinimumWidth -
    separatorWidth;
  const maximumWidth = Math.max(artifactMinimumWidth, availableWidth);
  return Math.min(maximumWidth, Math.max(artifactMinimumWidth, desiredWidth));
}

export function createWorkspacePreferencesStore(storage: StorageLike) {
  let memoryValue = defaultWorkspacePreferences;

  return {
    load(): WorkspacePreferences {
      try {
        const raw = storage.getItem(storageKey);
        if (!raw) return memoryValue;
        const parsed: unknown = JSON.parse(raw);
        const validated = validatePreferences(parsed);
        memoryValue = validated ?? defaultWorkspacePreferences;
        return memoryValue;
      } catch {
        return memoryValue;
      }
    },
    save(preferences: WorkspacePreferences) {
      memoryValue = preferences;
      try {
        storage.setItem(storageKey, JSON.stringify(preferences));
      } catch {
        // Restricted browsers still keep preferences for the current runtime.
      }
    }
  };
}

function validatePreferences(value: unknown): WorkspacePreferences | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sections = record.sidebarSections;
  if (
    (record.theme !== "light" &&
      record.theme !== "dark" &&
      record.theme !== "system") ||
    typeof record.artifactWidth !== "number" ||
    !Number.isFinite(record.artifactWidth) ||
    !sections ||
    typeof sections !== "object"
  ) {
    return null;
  }
  const sectionRecord = sections as Record<string, unknown>;
  if (
    typeof sectionRecord.project !== "boolean" ||
    typeof sectionRecord.drawing !== "boolean" ||
    typeof sectionRecord.sessions !== "boolean"
  ) {
    return null;
  }
  return {
    theme: record.theme,
    artifactWidth: record.artifactWidth,
    sidebarSections: {
      project: sectionRecord.project,
      drawing: sectionRecord.drawing,
      sessions: sectionRecord.sessions
    }
  };
}
