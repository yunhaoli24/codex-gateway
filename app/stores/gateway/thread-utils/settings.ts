import type { ThreadSettingsState } from "~~/shared/types";
import { trimmedOrNull } from "~~/shared/utils/strings";

export function normalizeThreadSettings(
  settings: ThreadSettingsState | null | undefined,
): ThreadSettingsState {
  if (settings === null || settings === undefined) return {};
  return {
    ...(Object.hasOwn(settings, "model") ? { model: trimmedOrNull(settings.model) } : {}),
    ...(Object.hasOwn(settings, "effort") ? { effort: trimmedOrNull(settings.effort) } : {}),
    ...(Object.hasOwn(settings, "summary") ? { summary: settings.summary ?? null } : {}),
    ...(Object.hasOwn(settings, "approvalPolicy")
      ? {
          approvalPolicy:
            settings.approvalPolicy === "untrusted" ||
            settings.approvalPolicy === "on-request" ||
            settings.approvalPolicy === "never"
              ? settings.approvalPolicy
              : null,
        }
      : {}),
    ...(Object.hasOwn(settings, "collaborationMode")
      ? { collaborationMode: normalizeCollaborationMode(settings.collaborationMode) }
      : {}),
  };
}

export function mergeThreadSettings(
  current: ThreadSettingsState,
  next: ThreadSettingsState,
): ThreadSettingsState {
  return {
    ...current,
    ...(Object.hasOwn(next, "model") ? { model: next.model ?? null } : {}),
    ...(Object.hasOwn(next, "effort") ? { effort: next.effort ?? null } : {}),
    ...(Object.hasOwn(next, "summary") ? { summary: next.summary ?? null } : {}),
    ...(Object.hasOwn(next, "approvalPolicy")
      ? { approvalPolicy: next.approvalPolicy ?? null }
      : {}),
    ...(Object.hasOwn(next, "collaborationMode")
      ? { collaborationMode: next.collaborationMode ?? null }
      : {}),
  };
}

function normalizeCollaborationMode(
  mode: ThreadSettingsState["collaborationMode"],
): ThreadSettingsState["collaborationMode"] {
  if (mode === null || mode === undefined) return null;
  const model = trimmedOrNull(mode.settings.model);
  if (model === null) return null;
  return {
    mode: mode.mode,
    settings: {
      model,
      reasoningEffort: trimmedOrNull(mode.settings.reasoningEffort),
      developerInstructions: trimmedOrNull(mode.settings.developerInstructions),
    },
  };
}
