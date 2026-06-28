import type { ThreadSettingsState } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import {
  mergeThreadSettings,
  messageFromError,
  normalizeThreadSettings,
  pinnedKey,
} from "../thread-utils";

export function createThreadSettingsActions(ctx: GatewayStoreContext) {
  return {
    setThreadSettings(
      hostId: number,
      threadId: string,
      settings: ThreadSettingsState | null | undefined,
    ) {
      ctx.state.threadSettingsByKey = {
        ...ctx.state.threadSettingsByKey,
        [pinnedKey(hostId, threadId)]: normalizeThreadSettings(settings),
      };
    },

    updateSelectedThreadSettings(settings: ThreadSettingsState) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      ctx.setThreadSettings(ctx.state.selectedHostId, ctx.state.selectedThreadId, {
        ...mergeThreadSettings(ctx.selectedThreadSettings, settings),
      });
    },

    async saveSelectedThreadSettings(settings: ThreadSettingsState) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      ctx.updateSelectedThreadSettings(settings);
      try {
        await $fetch("/api/threads/settings", {
          method: "POST",
          body: {
            hostId: ctx.state.selectedHostId,
            threadId: ctx.state.selectedThreadId,
            ...settings,
          },
        });
      } catch (error: any) {
        ctx.setError(messageFromError(error, "Failed to update thread settings"));
      }
    },
  };
}
