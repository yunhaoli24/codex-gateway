import { computed, reactive, toRefs } from "vue";
import { defineStore } from "pinia";
import { EventEmitter } from "@posva/event-emitter";
import type { ThreadSettingsState } from "~~/shared/types";
import { createGatewayState } from "./gateway/state";
import type { GatewayStoreContext } from "./gateway/types";
import { errorMessageLabels, pinnedKey, selectedThreadKey } from "./gateway/thread-utils/identity";
import { createCoreActions } from "./gateway/actions/core";
import { createHostActions } from "./gateway/actions/hosts";
import { createProjectActions } from "./gateway/actions/projects";
import { createThreadActions } from "./gateway/actions/threads";
import { createComposerActions } from "./gateway/actions/composer";
import type { GatewayDomainEventMap } from "./gateway/domain-events";
import { registerGatewayDomainSubscribers } from "./gateway/domain-subscribers";
import { projectThreadRuntime } from "./gateway/thread-runtime/projector";

export type { ThreadRuntimeStatus } from "./gateway/types";

export const useGatewayStore = defineStore("gateway", () => {
  const state = reactive(createGatewayState());
  const events = new EventEmitter<GatewayDomainEventMap>();
  const { t } = useI18n();

  const selectedHost = computed(
    () => state.hosts.find((host) => host.id === state.selectedHostId) ?? null,
  );
  const selectedProject = computed(
    () => state.projects.find((project) => project.id === state.selectedProjectId) ?? null,
  );
  const pinnedThreads = computed(() => state.gatewayConfig.pinnedThreads);
  const runningThreadKeySet = computed(() => new Set(state.runningThreadKeys));
  const selectedThreadStatus = computed(() => {
    if (!state.selectedHostId || !state.selectedThreadId) {
      return "idle";
    }
    return projectThreadRuntime(ctx, state.selectedHostId, state.selectedThreadId).status;
  });
  const defaultModel = computed(
    () => state.models.find((model) => model.isDefault) ?? state.models[0] ?? null,
  );
  const selectedThreadSettings = computed<ThreadSettingsState>(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key ? (state.threadSettingsByKey[key] ?? {}) : {};
  });
  const selectedThreadCollaborationMode = computed(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key ? (state.threadCollaborationModesByKey[key] ?? "default") : "default";
  });
  const selectedThreadGoal = computed(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key ? (state.threadGoalsByKey[key] ?? null) : null;
  });
  const selectedThreadGoalObservedAt = computed(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key ? (state.threadGoalObservedAtByKey[key] ?? null) : null;
  });
  const selectedThreadTokenUsage = computed(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key ? (state.threadTokenUsageByKey[key] ?? null) : null;
  });
  const selectedComposerDraft = computed(() => {
    const key = selectedThreadKey(state.selectedHostId, state.selectedThreadId);
    return key
      ? (state.composerDraftsByKey[key] ?? { text: "", attachedFiles: [] })
      : { text: "", attachedFiles: [] };
  });
  const activeSubAgentPanel = computed(() => {
    const key = state.activeSubAgentPanelKey;
    if (!key) {
      return null;
    }
    return (
      visibleSubAgentPanels.value.find(
        (panel) => pinnedKey(panel.hostId, panel.threadId) === key,
      ) ?? null
    );
  });
  const visibleSubAgentPanels = computed(() => {
    if (!state.selectedHostId || !state.selectedThreadId) {
      return [];
    }
    return state.subAgentPanels.filter(
      (panel) =>
        panel.parentHostId === state.selectedHostId &&
        panel.parentThreadId === state.selectedThreadId,
    );
  });
  const ctx = {} as GatewayStoreContext;
  Object.assign(ctx, {
    state,
    events,
    t,
  });
  Object.defineProperties(
    ctx,
    Object.getOwnPropertyDescriptors({
      get errorLabels() {
        return errorMessageLabels(t);
      },
      get selectedHost() {
        return selectedHost.value;
      },
      get selectedProject() {
        return selectedProject.value;
      },
      get pinnedThreads() {
        return pinnedThreads.value;
      },
      get runningThreadKeySet() {
        return runningThreadKeySet.value;
      },
      get selectedThreadStatus() {
        return selectedThreadStatus.value;
      },
      get defaultModel() {
        return defaultModel.value;
      },
      get selectedThreadSettings() {
        return selectedThreadSettings.value;
      },
      get selectedThreadCollaborationMode() {
        return selectedThreadCollaborationMode.value;
      },
      get selectedThreadGoal() {
        return selectedThreadGoal.value;
      },
      get selectedThreadGoalObservedAt() {
        return selectedThreadGoalObservedAt.value;
      },
      get selectedThreadTokenUsage() {
        return selectedThreadTokenUsage.value;
      },
      get selectedComposerDraft() {
        return selectedComposerDraft.value;
      },
    }),
  );

  const actions = {
    ...createCoreActions(ctx),
    ...createHostActions(ctx),
    ...createProjectActions(ctx),
    ...createThreadActions(ctx),
    ...createComposerActions(ctx),
  };
  Object.assign(ctx, actions);
  registerGatewayDomainSubscribers(ctx);

  function resetState() {
    Object.assign(state, createGatewayState());
  }

  return {
    ...toRefs(state),
    selectedHost,
    selectedProject,
    pinnedThreads,
    runningThreadKeySet,
    selectedThreadStatus,
    defaultModel,
    selectedThreadSettings,
    selectedThreadCollaborationMode,
    selectedThreadGoal,
    selectedThreadGoalObservedAt,
    selectedThreadTokenUsage,
    selectedComposerDraft,
    activeSubAgentPanel,
    visibleSubAgentPanels,
    resetState,
    ...actions,
  };
});
