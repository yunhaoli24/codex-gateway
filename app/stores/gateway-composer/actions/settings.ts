import type { ThreadSettingsState } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayStore } from "@/stores/gateway";
import { messageFromError, pinnedKey } from "@/stores/gateway/thread-utils/identity";
import {
  mergeThreadSettings,
  normalizeThreadSettings,
} from "@/stores/gateway/thread-utils/settings";

export function createThreadSettingsActions() {
  return {
    setThreadSettings(
      hostId: number,
      threadId: string,
      settings: ThreadSettingsState | null | undefined,
    ) {
      const composer = useGatewayComposerStore();
      composer.threadSettingsByKey = {
        ...composer.threadSettingsByKey,
        [pinnedKey(hostId, threadId)]: normalizeThreadSettings(settings),
      };
    },

    updateSelectedThreadSettings(settings: ThreadSettingsState) {
      const composer = useGatewayComposerStore();
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      this.setThreadSettings(navigation.selectedHostId, navigation.selectedThreadId, {
        ...mergeThreadSettings(composer.selectedThreadSettings, settings),
      });
    },

    setSelectedThreadCollaborationMode(mode: "default" | "plan") {
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      this.setThreadCollaborationMode(navigation.selectedHostId, navigation.selectedThreadId, mode);
    },

    setThreadCollaborationMode(hostId: number, threadId: string, mode: "default" | "plan") {
      const composer = useGatewayComposerStore();
      composer.threadCollaborationModesByKey = {
        ...composer.threadCollaborationModesByKey,
        [pinnedKey(hostId, threadId)]: mode,
      };
    },

    dismissPlanImplementationPrompt(hostId: number, threadId: string, planItemId: string) {
      const composer = useGatewayComposerStore();
      const key = pinnedKey(hostId, threadId);
      composer.dismissedPlanPromptIdsByKey = {
        ...composer.dismissedPlanPromptIdsByKey,
        [key]: { ...composer.dismissedPlanPromptIdsByKey[key], [planItemId]: true },
      };
    },

    dismissLatestSelectedPlanPrompt() {
      const navigation = useGatewayNavigationStore();
      const planItem = latestCompletedPlanItem(useGatewayThreadViewStore().history);
      if (!navigation.selectedHostId || !navigation.selectedThreadId || !planItem?.id) return;
      this.dismissPlanImplementationPrompt(
        navigation.selectedHostId,
        navigation.selectedThreadId,
        String(planItem.id),
      );
    },

    async saveSelectedThreadSettings(settings: ThreadSettingsState) {
      const gateway = useGatewayStore();
      const navigation = useGatewayNavigationStore();
      if (!navigation.selectedHostId || !navigation.selectedThreadId) return;
      const hostId = navigation.selectedHostId;
      const projectId = navigation.selectedProjectId;
      const threadId = navigation.selectedThreadId;
      this.updateSelectedThreadSettings(settings);
      try {
        await gatewayApi("/api/threads/settings", {
          method: "POST",
          body: { hostId, threadId, ...settings },
        });
      } catch (error: any) {
        gateway.setError(
          messageFromError(error, gateway.t("app.updateThreadSettingsFailed"), gateway.errorLabels),
          { hostId, projectId, threadId },
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
