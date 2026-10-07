<script setup lang="ts">
import type { GetTabContextMenuItemsParams } from "dockview-vue";
import { DockviewVue, themeDark, themeLight } from "dockview-vue";
import { computed, provide, ref, toRefs } from "vue";
import BrowserOpenDialog from "@/components/browser/BrowserOpenDialog.vue";
import { useTerminalTheme } from "@/composables/terminal/useTerminalTheme";
import { useWorkspaceLaunchActions } from "@/composables/workspace/useWorkspaceLaunchActions";
import { useTmuxMonitorLauncher } from "@/composables/workspace/useTmuxMonitorLauncher";
import { useChatWorkspaceState } from "../chat-workspace-state";
import { fileWorkspaceScopeKey } from "@/stores/file-workspace";
import { workspaceLayoutScopeKey } from "@/stores/gateway-workspace-layout";
import MobileWorkspaceHeader from "../MobileWorkspaceHeader.vue";
import { createDockTabMenu } from "./actions";
import { WORKSPACE_DOCK_UI_CONTEXT, WORKSPACE_FILES_PANEL_CONTEXT } from "./context";
import type { WorkspaceDockProps } from "./types";
import { useWorkspaceDockLifecycle } from "./useWorkspaceDockLifecycle";
import { useWorkspaceDockPanels } from "./useWorkspaceDockPanels";
import { useWorkspacePanels } from "./useWorkspacePanels";
import "dockview-vue/dist/styles/dockview.css";

const props = defineProps<WorkspaceDockProps>();
const refs = toRefs(props);
const workspace = useChatWorkspaceState();
const { t } = useI18n();
const { isDark } = useTerminalTheme();
const scopeKey = computed(() =>
  workspaceLayoutScopeKey(
    workspace.selectedHostId.value,
    workspace.selectedProjectId.value,
    workspace.selectedThreadId.value,
  ),
);
const {
  terminalPanels,
  subAgentPanels,
  browserPanels,
  tmuxPanels,
  hostMetricsPanel,
  gitReviewPanel,
  fileWorkspaceRoot,
} = useWorkspacePanels({
  selectedHostId: workspace.selectedHostId,
  selectedProjectId: workspace.selectedProjectId,
  selectedThreadId: workspace.selectedThreadId,
});
const panels = useWorkspaceDockPanels({
  selectedThreadId: workspace.selectedThreadId,
  terminalPanels,
  subAgentPanels,
  browserPanels,
  tmuxPanels,
  hostMetricsPanel,
  gitReviewPanel,
  scopeKey,
});
const fileRequestScopeKey = computed(() =>
  workspace.selectedHostId.value && workspace.selectedThreadId.value
    ? fileWorkspaceScopeKey(workspace.selectedHostId.value, workspace.selectedThreadId.value)
    : null,
);
const panelIds = computed(() => [
  terminalPanels.value.map(({ id }) => id),
  subAgentPanels.value.map(({ id }) => id),
  browserPanels.value.map(({ id }) => id),
  tmuxPanels.value.map(({ id }) => id),
  hostMetricsPanel.value.map(({ id }) => id),
  gitReviewPanel.value.map(({ id }) => id),
]);
const browserDialogOpen = ref(false);
const dockviewHost = ref<HTMLElement | null>(null);
const workspaceActions = useWorkspaceLaunchActions();
const tmuxLauncher = useTmuxMonitorLauncher();
const lifecycle = useWorkspaceDockLifecycle({
  scopeKey,
  host: dockviewHost,
  fileRequestScopeKey,
  reconcile: panels.reconcile,
  defaultLayout: panels.defaultLayout,
  panelIds,
});
const dockTheme = computed(() => (isDark.value ? themeDark : themeLight));

provide(WORKSPACE_FILES_PANEL_CONTEXT, {
  layout: refs.layout,
  selectedThreadId: workspace.selectedThreadId,
  selectedProjectId: workspace.selectedProjectId,
  selectedHostId: workspace.selectedHostId,
  rootPath: fileWorkspaceRoot,
});
provide(WORKSPACE_DOCK_UI_CONTEXT, {
  layout: refs.layout,
  closePanel: panels.closeDynamic,
});

function tabContextMenu({ panel, api }: GetTabContextMenuItemsParams) {
  return createDockTabMenu({
    api,
    panel,
    closeDynamic: panels.closeDynamic,
    labels: {
      splitRight: t("app.splitRight"),
      maximize: t("app.maximizePanel"),
      float: t("app.floatPanel"),
      popout: t("app.popoutPanel"),
      close: t("app.closeTab"),
      popupBlocked: t("app.popupBlocked"),
      popupBlockedDescription: t("app.popupBlockedDescription"),
    },
  });
}
</script>

<template>
  <div
    data-testid="workspace-dock-frame"
    class="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
  >
    <MobileWorkspaceHeader
      v-if="layout === 'mobile'"
      :can-open-terminal="workspace.canOpenTerminal.value"
      :tmux-active-count="tmuxLauncher.activeCount.value"
      @open-tmux="tmuxLauncher.open"
      @open-terminal="workspaceActions.openTerminal"
      @open-browser="browserDialogOpen = true"
      @open-host-monitor="workspaceActions.openHostMonitor"
    >
      <template #start><slot name="mobile-header-start" /></template>
    </MobileWorkspaceHeader>
    <!--
      h-0 + flex-1 gives the Dockview host a definite remaining height. Keeping an auto height here
      lets a restored grid contribute its stale intrinsic height during a keyed thread switch,
      which can shorten the whole workspace even though every panel agrees with its host.
    -->
    <!-- Core already provides tab-strip arrow navigation and ARIA semantics. The optional
         keyboardNavigation keymap requires dockview-enterprise and its licensed module; do not
         enable an unregistered enterprise feature in this community Dockview installation. -->
    <!-- Dockview core defaults proportionalLayout to true, but the Vue wrapper casts an omitted
         Boolean prop to false. Pass it explicitly here so live monitor/window resizing and JSON
         restoration preserve split ratios. Keep the official serialized grid dimensions: core
         uses them to scale the saved layout; a second percentage schema or resize observer would
         duplicate that responsibility and compete with Dockview's own ResizeObserver. -->
    <div ref="dockviewHost" class="gateway-dockview h-0 min-h-0 w-full flex-1 overflow-hidden">
      <DockviewVue
        class="h-full w-full"
        :proportional-layout="true"
        :right-header-actions-component="
          layout === 'desktop' ? 'WorkspaceDockGroupActions' : undefined
        "
        :theme="dockTheme"
        floating-group-bounds="boundedWithinViewport"
        :disable-floating-groups="layout === 'mobile'"
        :locked="layout === 'mobile'"
        :get-tab-context-menu-items="layout === 'desktop' ? tabContextMenu : undefined"
        @ready="lifecycle.ready"
      />
    </div>
    <BrowserOpenDialog
      v-if="layout === 'mobile'"
      v-model:open="browserDialogOpen"
      :open-target="workspaceActions.openBrowser"
    />
  </div>
</template>

<style scoped>
.gateway-dockview {
  --dv-background-color: var(--canvas);
  --dv-paneview-active-outline-color: var(--primary);
  --dv-tabs-and-actions-container-background-color: var(--canvas-soft);
  --dv-activegroup-visiblepanel-tab-background-color: var(--surface);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--canvas-soft);
  --dv-inactivegroup-visiblepanel-tab-background-color: var(--surface);
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--canvas-soft);
  --dv-tab-divider-color: var(--hairline);
  --dv-separator-border: var(--hairline);
  --dv-active-sash-color: var(--primary);
}
</style>
