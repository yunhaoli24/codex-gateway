import { watchImmediate } from "@vueuse/core";
import { storeToRefs } from "pinia";
import type { ComputedRef, Ref } from "vue";
import { computed, ref, watch } from "vue";
import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";
import { useGatewayTerminalTransport } from "@/composables/useGatewayTerminalTransport";
import { useGatewayStore } from "@/stores/gateway";
import {
  fileWorkspaceScopeKey,
  useGatewayFileWorkspaceStore,
} from "@/stores/gateway-file-workspace";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import type {
  SubAgentPanelState,
  TerminalSessionState,
  WorkspaceTabState,
} from "@/stores/gateway/types";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";
import {
  AGENT_WORKSPACE_TAB_ID,
  FILES_WORKSPACE_TAB_ID,
  subAgentWorkspaceTabId,
  terminalWorkspaceTabId,
} from "@/stores/gateway/workspace-tabs";

type WorkspaceTabSelection = {
  selectedHostId: Ref<number | null> | ComputedRef<number | null>;
  selectedProjectId: Ref<number | null> | ComputedRef<number | null>;
  selectedThreadId: Ref<string | null> | ComputedRef<string | null>;
  visibleSubAgentPanels: Ref<SubAgentPanelState[]> | ComputedRef<SubAgentPanelState[]>;
};

export function useWorkspaceTabs(selection: WorkspaceTabSelection) {
  const { t } = useI18n();
  const gatewayStore = useGatewayStore();
  const terminalStore = useGatewayTerminalStore();
  const terminalTransport = useGatewayTerminalTransport();
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const threadTurns = useGatewayThreadTurnsStore();
  const { activeWorkspaceTabId, terminalSessions } = storeToRefs(terminalStore);
  const { activeSubAgentPanelKey, threadViews, threadStatuses } = storeToRefs(gatewayStore);
  const activeTabByScope = ref<Record<string, string>>({});
  const selectionScopeKey = computed(() =>
    [
      selection.selectedHostId.value ?? "",
      selection.selectedProjectId.value ?? "",
      selection.selectedThreadId.value ?? "",
    ].join(":"),
  );

  const activeTab = computed({
    get: () => activeWorkspaceTabId.value,
    set: (value) => activateWorkspaceTab(String(value || AGENT_WORKSPACE_TAB_ID)),
  });
  const terminalPanels = computed(() =>
    Object.values(terminalSessions.value)
      .filter((session) => sessionMatchesSelection(session, selection))
      .map((session) => ({
        id: terminalWorkspaceTabId(session.sessionId),
        session,
      })),
  );
  const subAgentPanels = computed(() =>
    selection.visibleSubAgentPanels.value.map((panel) => createSubAgentPanel(panel)),
  );
  const visibleTabs = computed<WorkspaceTabState[]>(() => {
    const tabs: WorkspaceTabState[] = [
      { id: AGENT_WORKSPACE_TAB_ID, kind: "agent", title: t("app.agentTab") },
    ];
    if (selection.selectedThreadId.value) {
      tabs.push({ id: FILES_WORKSPACE_TAB_ID, kind: "files", title: t("app.filesTab") });
    }
    tabs.push(
      ...terminalPanels.value.map(({ session }) => terminalTab(session)),
      ...subAgentPanels.value.map(({ panel, title, key }) => ({
        id: subAgentWorkspaceTabId(key),
        kind: "subagent" as const,
        title,
        subtitle: panel.threadId,
        subAgentKey: key,
      })),
    );
    return tabs;
  });
  const fileWorkspaceRoot = computed(() => {
    const thread = gatewayStore.currentThread as Record<string, unknown> | null;
    const cwd = typeof thread?.cwd === "string" ? thread.cwd : "";
    return cwd || gatewayStore.selectedProject?.remotePath || "";
  });

  watch(
    [selectionScopeKey, () => visibleTabs.value.map((tab) => tab.id)],
    ([scopeKey, tabIds], [previousScopeKey]) => {
      const selectionChanged = scopeKey !== previousScopeKey;
      if (selectionChanged) {
        activateWorkspaceTab(preferredTabForScope(scopeKey, tabIds), { remember: false });
        return;
      }
      if (!tabIds.includes(activeWorkspaceTabId.value)) {
        activateWorkspaceTab(preferredTabForScope(scopeKey, tabIds), { remember: false });
      }
    },
    { immediate: true },
  );
  watchImmediate(activeSubAgentPanelKey, (key) =>
    activateExistingTab(key ? subAgentWorkspaceTabId(key) : null),
  );
  watchImmediate(
    () => fileWorkspace.workspaceOpenRequest,
    (request) => {
      const hostId = selection.selectedHostId.value;
      const threadId = selection.selectedThreadId.value;
      if (
        request &&
        hostId &&
        threadId &&
        request.scopeKey === fileWorkspaceScopeKey(hostId, threadId)
      ) {
        activateExistingTab(FILES_WORKSPACE_TAB_ID);
      }
    },
  );

  function createSubAgentPanel(panel: SubAgentPanelState) {
    const key = pinnedKey(panel.hostId, panel.threadId);
    const preview = threadViews.value[key] ?? null;
    const history = preview?.history as any;
    const turns = (history?.thread?.turns || history?.turns || []) as ThreadTimelineTurn[];
    const thread = preview?.currentThread as Record<string, any> | null;
    return {
      id: subAgentWorkspaceTabId(key),
      key,
      panel,
      preview,
      turns,
      followKey: [key],
      status: threadStatuses.value[key] ?? "idle",
      title: (thread ? titleForThread(thread) : null) || panel.title || panel.threadId,
    };
  }

  function closeWorkspaceTab(tab: WorkspaceTabState) {
    if (tab.kind === "terminal" && tab.sessionId) {
      void terminalTransport.closeTerminal(tab.sessionId);
      return;
    }
    if (tab.kind === "subagent" && tab.subAgentKey) {
      closeSubAgentTab(tab.subAgentKey);
      return;
    }
  }

  async function interruptSubAgent(panel: SubAgentPanelState) {
    const key = pinnedKey(panel.hostId, panel.threadId);
    const projectId = threadViews.value[key]?.projectId ?? null;
    await threadTurns.interruptThreadTurn({
      hostId: panel.hostId,
      threadId: panel.threadId,
      projectId,
    });
  }

  function closeSubAgentTab(key: string) {
    const panel = selection.visibleSubAgentPanels.value.find(
      (item) => pinnedKey(item.hostId, item.threadId) === key,
    );
    if (panel) {
      gatewayStore.closeSubAgentPanel({ hostId: panel.hostId, threadId: panel.threadId });
    }
  }

  function activateWorkspaceTab(tabId: string, options: { remember?: boolean } = {}) {
    terminalStore.setActiveWorkspaceTab(tabId);
    if (options.remember !== false && visibleTabs.value.some((tab) => tab.id === tabId)) {
      activeTabByScope.value = {
        ...activeTabByScope.value,
        [selectionScopeKey.value]: tabId,
      };
    }
  }

  function activateExistingTab(tabId: string | null) {
    if (tabId && visibleTabs.value.some((tab) => tab.id === tabId)) {
      activateWorkspaceTab(tabId);
    }
  }

  function preferredTabForScope(scopeKey: string, tabIds: string[]) {
    const remembered = activeTabByScope.value[scopeKey];
    if (remembered && tabIds.includes(remembered)) {
      return remembered;
    }
    return AGENT_WORKSPACE_TAB_ID;
  }

  return {
    activeTab,
    activeWorkspaceTabId,
    visibleTabs,
    terminalPanels,
    subAgentPanels,
    fileWorkspaceRoot,
    closeWorkspaceTab,
    interruptSubAgent,
  };
}

function sessionMatchesSelection(
  session: TerminalSessionState | undefined,
  selection: WorkspaceTabSelection,
) {
  if (!session || session.hostId !== selection.selectedHostId.value) {
    return false;
  }
  if (session.scope === "thread") {
    return session.threadId === selection.selectedThreadId.value;
  }
  if (session.scope === "project") {
    return (
      !selection.selectedThreadId.value && session.projectId === selection.selectedProjectId.value
    );
  }
  return !selection.selectedThreadId.value && !selection.selectedProjectId.value;
}

function terminalTab(session: TerminalSessionState): WorkspaceTabState {
  return {
    id: terminalWorkspaceTabId(session.sessionId),
    kind: "terminal",
    title: session.title,
    sessionId: session.sessionId,
  };
}
