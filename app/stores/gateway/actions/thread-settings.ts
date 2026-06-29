import type { ThreadSettingsState } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import { messageFromError, pinnedKey } from "../thread-utils/identity";
import { mergeThreadSettings, normalizeThreadSettings } from "../thread-utils/settings";

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
      const hostId = ctx.state.selectedHostId;
      const projectId = ctx.state.selectedProjectId;
      const threadId = ctx.state.selectedThreadId;
      ctx.updateSelectedThreadSettings(settings);
      try {
        await $fetch("/api/threads/settings", {
          method: "POST",
          body: {
            hostId,
            threadId,
            ...settings,
          },
        });
      } catch (error: any) {
        ctx.setError(
          messageFromError(error, ctx.t("app.updateThreadSettingsFailed"), ctx.errorLabels),
          {
            hostId,
            projectId,
            threadId,
          },
        );
      }
    },
  };
}
