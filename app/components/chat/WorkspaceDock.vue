<script setup lang="ts">
import type { GetTabContextMenuItemsParams } from "dockview-vue";
import { DockviewVue, themeDark, themeLight } from "dockview-vue";
import { computed, provide, toRefs } from "vue";
import BrowserOpenDialog from "@/components/browser/BrowserOpenDialog.vue";
import { useTerminalTheme } from "@/composables/useTerminalTheme";
import { useWorkspaceLaunchActions } from "@/composables/useWorkspaceLaunchActions";
import { fileWorkspaceScopeKey } from "@/stores/gateway-file-workspace";
import { workspaceLayoutScopeKey } from "@/stores/gateway-workspace-layout";
import MobileWorkspaceHeader from "./MobileWorkspaceHeader.vue";
import { createDockTabMenu } from "./workspace-dock-actions";
import {
  WORKSPACE_AGENT_PANEL_CONTEXT,
  WORKSPACE_DOCK_UI_CONTEXT,
  WORKSPACE_FILES_PANEL_CONTEXT,
} from "./workspace-dock-context";
import type { WorkspaceDockProps } from "./workspace-dock-types";
import { useWorkspaceDockLifecycle } from "./useWorkspaceDockLifecycle";
import { useWorkspaceDockPanels } from "./useWorkspaceDockPanels";
import { useWorkspacePanels } from "./useWorkspacePanels";
import "dockview-vue/dist/styles/dockview.css";

const props = defineProps<WorkspaceDockProps>();
const emit = defineEmits<{ loadOlder: []; openTerminal: [] }>();
const refs = toRefs(props);
const { t } = useI18n();
const { isDark } = useTerminalTheme();
const { terminalPanels, subAgentPanels, browserPanels, fileWorkspaceRoot } = useWorkspacePanels({
  selectedHostId: refs.selectedHostId,
  selectedProjectId: refs.selectedProjectId,
  selectedThreadId: refs.selectedThreadId,
  visibleSubAgentPanels: refs.visibleSubAgentPanels,
});
const panels = useWorkspaceDockPanels({
  selectedThreadId: refs.selectedThreadId,
  terminalPanels,
  subAgentPanels,
  browserPanels,
});
const scopeKey = computed(() =>
  workspaceLayoutScopeKey(props.selectedHostId, props.selectedProjectId, props.selectedThreadId),
);
const fileRequestScopeKey = computed(() =>
  props.selectedHostId && props.selectedThreadId
    ? fileWorkspaceScopeKey(props.selectedHostId, props.selectedThreadId)
    : null,
);
const panelIds = computed(() => [
  terminalPanels.value.map(({ id }) => id),
  subAgentPanels.value.map(({ id }) => id),
  browserPanels.value.map(({ id }) => id),
]);
const browserDialogOpen = ref(false);
const workspaceActions = useWorkspaceLaunchActions();
const lifecycle = useWorkspaceDockLifecycle({
  scopeKey,
  fileRequestScopeKey,
  reconcile: panels.reconcile,
  panelIds,
});
const dockTheme = computed(() => (isDark.value ? themeDark : themeLight));

provide(WORKSPACE_AGENT_PANEL_CONTEXT, {
  initializing: refs.initializing,
  openingThread: refs.openingThread,
  selectedThreadId: refs.selectedThreadId,
  selectedThreadStatus: refs.selectedThreadStatus,
  selectedProjectId: refs.selectedProjectId,
  selectedHostId: refs.selectedHostId,
  historyTurns: refs.historyTurns,
  loading: refs.loading,
  loadingOlderTurns: refs.loadingOlderTurns,
  olderTurnsCursor: refs.olderTurnsCursor,
  visibleError: refs.visibleError,
  followKey: refs.followKey,
  selectedThreadViewReady: refs.selectedThreadViewReady,
  loadOlder: () => emit("loadOlder"),
});
provide(WORKSPACE_FILES_PANEL_CONTEXT, {
  layout: refs.layout,
  selectedThreadId: refs.selectedThreadId,
  selectedProjectId: refs.selectedProjectId,
  selectedHostId: refs.selectedHostId,
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
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <MobileWorkspaceHeader
      v-if="layout === 'mobile'"
      :can-open-terminal="canOpenTerminal"
      @open-terminal="emit('openTerminal')"
      @open-browser="browserDialogOpen = true"
    >
      <template #start><slot name="mobile-header-start" /></template>
    </MobileWorkspaceHeader>
    <DockviewVue
      class="gateway-dockview min-h-0 flex-1"
      :right-header-actions-component="
        layout === 'desktop' ? 'WorkspaceDockGroupActions' : undefined
      "
      :theme="dockTheme"
      floating-group-bounds="boundedWithinViewport"
      :disable-floating-groups="layout === 'mobile'"
      :locked="layout === 'mobile'"
      :keyboard-navigation="true"
      :get-tab-context-menu-items="layout === 'desktop' ? tabContextMenu : undefined"
      @ready="lifecycle.ready"
    />
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
