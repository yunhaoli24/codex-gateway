import type { ThreadSettingsState } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
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

    setSelectedThreadCollaborationMode(mode: "default" | "plan") {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      ctx.setThreadCollaborationMode(ctx.state.selectedHostId, ctx.state.selectedThreadId, mode);
    },

    setThreadCollaborationMode(hostId: number, threadId: string, mode: "default" | "plan") {
      ctx.state.threadCollaborationModesByKey = {
        ...ctx.state.threadCollaborationModesByKey,
        [pinnedKey(hostId, threadId)]: mode,
      };
    },

    dismissPlanImplementationPrompt(hostId: number, threadId: string, planItemId: string) {
      const key = pinnedKey(hostId, threadId);
      ctx.state.dismissedPlanPromptIdsByKey = {
        ...ctx.state.dismissedPlanPromptIdsByKey,
        [key]: {
          ...ctx.state.dismissedPlanPromptIdsByKey[key],
          [planItemId]: true,
        },
      };
    },

    dismissLatestSelectedPlanPrompt() {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return;
      }
      const planItem = latestCompletedPlanItem(ctx.state.history);
      if (!planItem?.id) {
        return;
      }
      ctx.dismissPlanImplementationPrompt(
        ctx.state.selectedHostId,
        ctx.state.selectedThreadId,
        String(planItem.id),
      );
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
        await gatewayApi("/api/threads/settings", {
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

function latestCompletedPlanItem(history: unknown) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const items = Array.isArray(turn?.items) ? turn.items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (item?.type === "plan" && (item.status === "completed" || turn?.status === "completed")) {
        return item;
      }
    }
  }
  return null;
}
