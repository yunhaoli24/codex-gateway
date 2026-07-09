import { watchImmediate } from "@vueuse/core";
import { storeToRefs } from "pinia";
import type { ComputedRef, Ref } from "vue";
import { computed, ref, watch } from "vue";
import type { FilePreviewTab } from "~~/shared/types";
import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";
import { useGatewayTerminalTransport } from "@/composables/useGatewayTerminalTransport";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayFilePreviewStore } from "@/stores/gateway-file-preview";
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
  fileWorkspaceTabId,
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
  const filePreview = useGatewayFilePreviewStore();
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
  const selectedFileTabs = computed(() =>
    filePreview.visibleTabsFor(selection.selectedHostId.value, selection.selectedThreadId.value),
  );
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
  const filePanels = computed(() =>
    selectedFileTabs.value.map((file) => ({
      id: fileWorkspaceTabId(file.key),
      file,
    })),
  );
  const visibleTabs = computed<WorkspaceTabState[]>(() => [
    { id: AGENT_WORKSPACE_TAB_ID, kind: "agent", title: t("app.agentTab") },
    ...terminalPanels.value.map(({ session }) => terminalTab(session)),
    ...subAgentPanels.value.map(({ panel, title, key }) => ({
      id: subAgentWorkspaceTabId(key),
      kind: "subagent" as const,
      title,
      subtitle: panel.threadId,
      subAgentKey: key,
    })),
    ...selectedFileTabs.value.map(fileTab),
  ]);

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
  watchImmediate(
    () => filePreview.activeTabKey,
    (key) => activateExistingTab(key ? fileWorkspaceTabId(key) : null),
  );
  watchImmediate(activeSubAgentPanelKey, (key) =>
    activateExistingTab(key ? subAgentWorkspaceTabId(key) : null),
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
    if (tab.kind === "file" && tab.fileKey) {
      filePreview.closeTab(tab.fileKey);
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
    filePanels,
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

function fileTab(file: FilePreviewTab): WorkspaceTabState {
  return {
    id: fileWorkspaceTabId(file.key),
    kind: "file",
    title: file.title,
    subtitle: file.path,
    fileKey: file.key,
  };
}
