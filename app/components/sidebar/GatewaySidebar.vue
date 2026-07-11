<script setup lang="ts">
import { SettingsIcon } from "@lucide/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";
import { useLongPressContextMenu } from "@/composables/useLongPressContextMenu";
import { useGatewayStore } from "@/stores/gateway";
import AddProjectDialog from "./AddProjectDialog.vue";
import HostTree from "./HostTree.vue";
import PinnedThreadList from "./PinnedThreadList.vue";
import SidebarScrollArea from "./SidebarScrollArea.vue";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebarTree } from "./useSidebarTree";
import { useThreadRename } from "./useThreadRename";

const store = useGatewayStore();
const { t } = useI18n();
const showSettings = ref(false);
const projectEditor = ref<{ host: any; project: any | null } | null>(null);
const { longPressTriggered, longPressContextMenuHandlers } = useLongPressContextMenu();
const sidebarTree = useSidebarTree(store, longPressTriggered);
const threadRename = useThreadRename(store);

defineOptions({
  inheritAttrs: false,
});

function openAddProject(host: any) {
  projectEditor.value = { host, project: null };
}

function openEditProject(project: any) {
  const host = sidebarTree.hosts.value.find((item: any) => item.id === project.hostId);
  if (!host) {
    return;
  }
  projectEditor.value = { host, project };
}
</script>

<template>
  <aside
    v-bind="$attrs"
    class="relative flex min-h-0 flex-col border-r border-hairline bg-canvas-soft"
  >
    <div class="flex min-h-0 flex-1 overflow-hidden px-3 py-3">
      <SidebarScrollArea>
        <div class="space-y-4 pr-1">
          <PinnedThreadList
            :threads="sidebarTree.pinnedThreads.value"
            :hosts="sidebarTree.hosts.value"
            :selected-host-id="sidebarTree.selectedHostId.value"
            :selected-thread-id="sidebarTree.selectedThreadId.value"
            :renaming-thread-id="threadRename.renamingThreadId.value"
            :rename-value="threadRename.renameValue.value"
            :long-press-handlers="longPressContextMenuHandlers"
            :runtime-status="sidebarTree.pinnedRuntimeStatus"
            :completion-attention="sidebarTree.pinnedCompletionAttention"
            @open="sidebarTree.openPinnedThread"
            @unpin="store.setPinnedThread($event, false)"
            @rename="threadRename.startInlineRename"
            @submit-rename="threadRename.submitRename"
            @rename-keydown="threadRename.handleRenameKeydown"
            @update:rename-value="threadRename.renameValue.value = $event"
          >
            <template #header-action>
              <SidebarTrigger
                data-testid="desktop-sidebar-collapse"
                class="-mr-1 size-7"
                :title="$t('app.hideSidebar')"
                :aria-label="$t('app.hideSidebar')"
              />
            </template>
          </PinnedThreadList>

          <HostTree
            :hosts="sidebarTree.hosts.value"
            :available-projects-by-host="sidebarTree.availableProjectsByHost.value"
            :missing-projects-by-host="sidebarTree.missingProjectsByHost.value"
            :project-threads="sidebarTree.projectThreads.value"
            :expanded-host-ids="sidebarTree.expandedHostIds.value"
            :expanded-project-ids="sidebarTree.expandedProjectIds.value"
            :expanded-missing-project-host-ids="sidebarTree.expandedMissingProjectHostIds.value"
            :selected-host-id="sidebarTree.selectedHostId.value"
            :selected-project-id="sidebarTree.selectedProjectId.value"
            :selected-thread-id="sidebarTree.selectedThreadId.value"
            :host-connection-statuses="sidebarTree.hostConnectionStatuses.value"
            :renaming-thread-id="threadRename.renamingThreadId.value"
            :rename-value="threadRename.renameValue.value"
            :long-press-handlers="longPressContextMenuHandlers"
            :thread-runtime-status="sidebarTree.threadRuntimeStatus"
            :thread-completion-attention="sidebarTree.threadCompletionAttention"
            @select-host="sidebarTree.selectHost"
            @add-project="openAddProject"
            @delete-host="store.deleteHost"
            @select-project="sidebarTree.selectProject"
            @toggle-missing-projects="sidebarTree.toggleMissingProjects"
            @edit-project="openEditProject"
            @delete-project="store.deleteProject"
            @start-thread-in-project="sidebarTree.startThreadInProject"
            @open-thread="sidebarTree.openThread"
            @toggle-thread-pin="store.setThreadPinned"
            @rename="threadRename.startInlineRename"
            @submit-rename="threadRename.submitRename"
            @rename-keydown="threadRename.handleRenameKeydown"
            @update:rename-value="threadRename.renameValue.value = $event"
          />
        </div>
      </SidebarScrollArea>
    </div>

    <div class="shrink-0 border-t border-hairline p-3">
      <Button
        data-testid="settings-toggle"
        variant="ghost"
        class="h-10 w-full justify-start gap-3 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-surface"
        @click="showSettings = !showSettings"
      >
        <SettingsIcon class="size-4" />
        {{ t("app.settings") }}
      </Button>
    </div>

    <Dialog v-model:open="showSettings">
      <DialogContent
        class="flex h-[min(54rem,calc(100vh-3rem))] w-[min(70rem,calc(100vw-3rem))] !max-w-[min(70rem,calc(100vw-3rem))] flex-col overflow-hidden p-0"
        data-testid="settings-dialog"
        close-button-test-id="settings-close-button"
      >
        <DialogHeader class="border-b border-hairline px-6 py-5">
          <DialogTitle class="text-lg">{{ t("app.settings") }}</DialogTitle>
          <DialogDescription>{{ t("app.settingsDescription") }}</DialogDescription>
        </DialogHeader>
        <div class="flex min-h-0 flex-1 overflow-hidden px-6 py-5">
          <SettingsPanel @close="showSettings = false" />
        </div>
      </DialogContent>
    </Dialog>

    <AddProjectDialog
      :open="Boolean(projectEditor)"
      :host="projectEditor?.host ?? null"
      :project="projectEditor?.project ?? null"
      @update:open="projectEditor = $event ? projectEditor : null"
    />
  </aside>
</template>
