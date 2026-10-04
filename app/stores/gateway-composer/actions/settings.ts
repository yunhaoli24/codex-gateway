import type { ThreadHistoryItem, ThreadHistoryState, ThreadSettingsState } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import {
  messageFromError,
  pinnedKey,
  selectedThreadScope,
} from "@/stores/gateway/thread-utils/identity";
import { idFromUnknown } from "~~/shared/utils/records";
import {
  mergeThreadSettings,
  normalizeThreadSettings,
} from "@/stores/gateway/thread-utils/settings";
import { statusValue } from "@/utils/thread-items";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { requestRunningTurnSettingsUpdate } from "../turn-settings-transport";

export function createThreadSettingsActions() {
  return {
    setThreadSettings(
      hostId: number,
      threadId: string,
      settings: ThreadSettingsState | null | undefined,
    ) {
      const composer = useGatewayComposerStore();
      const key = pinnedKey(hostId, threadId);
      composer.threadSettingsByKey = {
        ...composer.threadSettingsByKey,
        [key]: mergeThreadSettings(
          composer.threadSettingsByKey[key] ?? {},
          normalizeThreadSettings(settings),
        ),
      };
    },

    updateSelectedThreadSettings(settings: ThreadSettingsState) {
      const composer = useGatewayComposerStore();
      const navigation = useGatewayNavigationStore();
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      if (scope === null) return;
      this.setThreadSettings(scope.hostId, scope.threadId, {
        ...mergeThreadSettings(composer.selectedThreadSettings, settings),
      });
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
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      const planItemId = idFromUnknown(planItem?.id);
      if (scope === null || planItemId === null) return;
      this.dismissPlanImplementationPrompt(scope.hostId, scope.threadId, String(planItemId));
    },

    async saveSelectedThreadSettings(settings: ThreadSettingsState) {
      const navigation = useGatewayNavigationStore();
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      if (scope === null) return false;
      return this.saveThreadSettings(
        scope.hostId,
        scope.threadId,
        navigation.selectedProjectId,
        settings,
      );
    },

    async saveThreadSettings(
      hostId: number,
      threadId: string,
      projectId: number | null,
      settings: ThreadSettingsState,
    ) {
      const sessionIsCurrent = captureSessionEpoch();
      const gateway = useGatewayBootstrapStore();
      try {
        await gatewayApi("/api/threads/settings", {
          method: "POST",
          body: { hostId, threadId, ...settings },
        });
        const runtime = useGatewayThreadRuntimeStore();
        const turnId = runtime.activeTurnIdsByThreadKey[pinnedKey(hostId, threadId)];
        if (
          turnId !== undefined &&
          ("model" in settings || "effort" in settings || "summary" in settings)
        ) {
          await requestRunningTurnSettingsUpdate({
            hostId,
            threadId,
            turnId,
            settings,
          });
          // targetUnavailable means the exact live task already advanced or cannot be switched;
          // the thread default above remains authoritative for the next Turn. The response is
          // therefore acknowledged without reverting the user's composer selection.
        }
        if (!sessionIsCurrent()) return false;
        this.setThreadSettings(hostId, threadId, settings);
        return true;
      } catch (error: unknown) {
        if (!sessionIsCurrent()) return false;
        gateway.setError(
          messageFromError(error, gateway.t("app.updateThreadSettingsFailed"), gateway.errorLabels),
          { hostId, projectId, threadId },
        );
        return false;
      }
    },
  };
}

function latestCompletedPlanItem(history: ThreadHistoryState | null): ThreadHistoryItem | null {
  const turns = history?.thread.turns ?? [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const items = turn?.items ?? [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (
        item?.type === "plan" &&
        (statusValue(item.status) === "completed" || statusValue(turn?.status) === "completed")
      ) {
        return item;
      }
    }
  }
  return null;
}
