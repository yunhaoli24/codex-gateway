import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useGatewayTerminalTransport } from "@/composables/terminal/useGatewayTerminalTransport";
import { createUuid } from "@/lib/uuid";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";
import { browserWorkspacePanelId } from "@/stores/gateway/workspace-panels";

export function useWorkspaceLaunchActions() {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const threadView = useGatewayThreadViewStore();
  const browser = useGatewayBrowserStore();
  const layout = useGatewayWorkspaceLayoutStore();
  const terminal = useGatewayTerminalTransport();
  const { selectedHost, selectedProject } = storeToRefs(gateway);
  const { selectedHostId, selectedProjectId, selectedThreadId } = storeToRefs(navigation);

  function openTerminal() {
    if (!selectedHostId.value || !selectedHost.value) return;
    if (selectedThreadId.value) {
      const thread = currentThreadRecord(threadView.currentThread);
      void terminal.openTerminal({
        scope: "thread",
        hostId: selectedHostId.value,
        projectId: selectedProjectId.value,
        threadId: selectedThreadId.value,
        cwd:
          (typeof thread.cwd === "string" ? thread.cwd : null) ??
          selectedProject.value?.remotePath ??
          null,
        title: titleForThread({ id: selectedThreadId.value, ...thread }),
      });
      return;
    }
    if (selectedProject.value) {
      void terminal.openTerminal({
        scope: "project",
        hostId: selectedProject.value.hostId,
        projectId: selectedProject.value.id,
        cwd: selectedProject.value.remotePath,
        title: selectedProject.value.name,
      });
      return;
    }
    void terminal.openTerminal({
      scope: "host",
      hostId: selectedHostId.value,
      title: selectedHost.value.name,
    });
  }

  function openBrowser(targetUrl: string) {
    if (!selectedHostId.value) return;
    const panelId = createUuid();
    browser.addPanel({
      panelId,
      title: browserTitle(targetUrl),
      targetUrl,
      hostId: selectedHostId.value,
      projectId: selectedProjectId.value,
      threadId: selectedThreadId.value,
    });
    layout.requestPanelActivation(browserWorkspacePanelId(panelId));
  }

  return {
    canLaunch: computed(() => Boolean(selectedHostId.value)),
    selectedHostTitle: computed(() => selectedHost.value?.name ?? "Codex Gateway"),
    openTerminal,
    openBrowser,
  };
}

function currentThreadRecord(thread: unknown): Record<string, unknown> {
  return thread !== null && typeof thread === "object"
    ? Object.fromEntries(Object.entries(thread))
    : {};
}

function browserTitle(targetUrl: string) {
  try {
    return new URL(/:\/\//.test(targetUrl) ? targetUrl : `http://${targetUrl}`).host;
  } catch {
    return targetUrl;
  }
}
