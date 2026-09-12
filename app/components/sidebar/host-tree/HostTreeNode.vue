<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderXIcon,
  ServerIcon,
  ChartNoAxesCombinedIcon,
  Trash2Icon,
} from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@codex-gateway/ui/context-menu";
import type { HostRecord } from "../sidebar-types";
import { formatRelative, selectedRowClass } from "../sidebar-utils";
import HostStatusIndicator from "./HostStatusIndicator.vue";
import HostMfaButton from "./HostMfaButton.vue";
import SidebarRowLabel from "../SidebarRowLabel.vue";
import SidebarProjectRow from "./SidebarProjectRow.vue";
import ThreadRow from "../thread-list/ThreadRow.vue";
import { requireHostTreeController } from "./controller";
import { useHostMfaDialog } from "@/composables/host-mfa/useHostMfaDialog";
import { useGatewayHostMfaStore } from "@/stores/gateway-host-mfa";
import { ref, watch } from "vue";

const props = defineProps<{ host: HostRecord }>();
const controller = requireHostTreeController();
const mfaDialog = useHostMfaDialog();
const mfaStore = useGatewayHostMfaStore();

function handleMfaClick(hostId: number) {
  if (mfaStore.hasPendingMfa(hostId)) {
    // This prompt came from a live SSH keyboard-interactive exchange, so no new connection is
    // needed and the code can be entered immediately after the explicit button click.
    mfaDialog.openMfaDialog(hostId);
    return;
  }
  waitingForMfaPrompt.value = true;
  mfaStore.connectMfaHost(hostId);
}

const waitingForMfaPrompt = ref(false);

// A pending request is only actionable after this click starts a fresh SSH attempt. Background
// detection must keep the button closed until the user explicitly asks to reconnect.
watch(
  () => mfaStore.hasPendingMfa(props.host.id),
  (pending) => {
    if (!pending || !waitingForMfaPrompt.value) return;
    waitingForMfaPrompt.value = false;
    mfaDialog.openMfaDialog(props.host.id);
  },
);
</script>

<template>
  <div class="min-w-0 overflow-hidden rounded-lg">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <Button
          :data-testid="`host-button-${host.id}`"
          v-bind="controller.longPressHandlers"
          variant="ghost"
          class="h-11 w-full min-w-0 justify-start gap-2 overflow-hidden rounded-lg px-3 text-left text-[0.9375rem] font-normal hover:bg-surface"
          :class="selectedRowClass(host.id === controller.selectedHostId)"
          @click="controller.selectHost(host.id)"
        >
          <ChevronDownIcon
            v-if="controller.expandedHostIds.has(host.id)"
            class="size-3.5 shrink-0 text-ink-muted"
          />
          <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
          <ServerIcon class="size-4 shrink-0" />
          <SidebarRowLabel :title="host.name" :subtitle="host.sshHost">
            <template #trailing>
              <HostStatusIndicator
                :status="controller.hostConnectionStatuses[host.id]?.status ?? 'idle'"
                :label="controller.hostConnectionStatuses[host.id]?.message"
              />
              <HostMfaButton
                v-if="
                  ['mfaRequired', 'mfaConnecting'].includes(
                    controller.hostConnectionStatuses[host.id]?.status ?? '',
                  )
                "
                :host-id="host.id"
                :connecting="controller.hostConnectionStatuses[host.id]?.status === 'mfaConnecting'"
                @click="handleMfaClick"
              />
            </template>
          </SidebarRowLabel>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent :collision-padding="12" prioritize-position class="w-44">
        <ContextMenuItem @select="controller.monitorHost(host.id)">
          <ChartNoAxesCombinedIcon class="mr-2 size-4" />
          {{ $t("app.openHostMonitor") }}
        </ContextMenuItem>
        <ContextMenuItem @select="controller.addProject(host)">
          <FolderIcon class="mr-2 size-4" />
          {{ $t("app.addProject") }}
        </ContextMenuItem>
        <ContextMenuItem
          class="text-destructive focus:text-destructive"
          @select="controller.deleteHost(host.id)"
        >
          <Trash2Icon class="mr-2 size-4" />
          {{ $t("app.deleteHost") }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <div
      v-if="controller.expandedHostIds.has(host.id)"
      class="mt-1 min-w-0 space-y-1 overflow-hidden pl-5"
    >
      <div
        v-for="project in controller.availableProjectsByHost.get(host.id) ?? []"
        :key="project.id"
        class="min-w-0 space-y-1 overflow-hidden"
      >
        <SidebarProjectRow
          :project="project"
          :expanded="controller.expandedProjectIds.has(project.id)"
          :selected="project.id === controller.selectedProjectId"
          :long-press-handlers="controller.longPressHandlers"
          @select="controller.selectProject(project.id, $event)"
          @edit="controller.editProject(project)"
          @delete="controller.deleteProject(project.id)"
          @start-thread="controller.startThreadInProject(project)"
        />
        <div
          v-if="controller.expandedProjectIds.has(project.id)"
          class="min-w-0 space-y-1 overflow-hidden pl-7"
        >
          <template
            v-if="project.id === controller.selectedProjectId && controller.projectThreads.length"
          >
            <ThreadRow
              v-for="thread in controller.projectThreads"
              :key="thread.id"
              :thread="thread"
              :test-id="`thread-button-${thread.id}`"
              :selected="String(thread.id) === String(controller.selectedThreadId)"
              :status="controller.threadRuntimeStatus(project.hostId, String(thread.id))"
              :completion-attention="
                controller.threadCompletionAttention(project.hostId, String(thread.id))
              "
              :subtitle="formatRelative(thread.updatedAt)"
              :pin-label="thread.pinned ? $t('app.unpinThread') : $t('app.pinThread')"
              :long-press-handlers="controller.longPressHandlers"
              :show-pinned-icon="thread.pinned"
              @open="
                controller.openThread(String(thread.id), {
                  hostId: project.hostId,
                  projectId: project.id,
                })
              "
              @toggle-pin="controller.toggleThreadPin(String(thread.id), !thread.pinned)"
              @rename="controller.rename({ ...thread, hostId: project.hostId })"
            />
          </template>
          <div
            v-else-if="project.id === controller.selectedProjectId"
            class="rounded-lg px-3 py-2 text-xs leading-5 text-ink-muted"
          >
            <div>{{ $t("app.noThreads") }}</div>
            <div>{{ $t("app.refreshThreadsHint") }}</div>
          </div>
        </div>
      </div>

      <div
        v-if="(controller.missingProjectsByHost.get(host.id)?.length ?? 0) > 0"
        class="space-y-1"
      >
        <Button
          :data-testid="`missing-projects-toggle-${host.id}`"
          variant="ghost"
          class="h-9 w-full justify-start gap-2 rounded-lg px-3 text-xs font-normal text-ink-muted hover:bg-surface"
          @click="controller.toggleMissingProjects(host.id)"
        >
          <ChevronDownIcon
            v-if="controller.expandedMissingProjectHostIds.has(host.id)"
            class="size-3.5 shrink-0"
          />
          <ChevronRightIcon v-else class="size-3.5 shrink-0" />
          <FolderXIcon class="size-4 shrink-0 text-destructive/70" />
          <span class="min-w-0 flex-1 truncate text-left">{{ $t("app.missingProjects") }}</span>
          <span class="shrink-0 tabular-nums">{{
            controller.missingProjectsByHost.get(host.id)?.length ?? 0
          }}</span>
        </Button>
        <div v-if="controller.expandedMissingProjectHostIds.has(host.id)" class="space-y-1">
          <SidebarProjectRow
            v-for="project in controller.missingProjectsByHost.get(host.id) ?? []"
            :key="project.id"
            :project="project"
            :expanded="false"
            :selected="project.id === controller.selectedProjectId"
            :missing="true"
            :long-press-handlers="controller.longPressHandlers"
            @edit="controller.editProject(project)"
            @delete="controller.deleteProject(project.id)"
          />
        </div>
      </div>

      <div
        v-if="
          !controller.availableProjectsByHost.get(host.id)?.length &&
          !controller.missingProjectsByHost.get(host.id)?.length
        "
        class="rounded-lg px-3 py-2 text-xs text-ink-muted"
      >
        {{ $t("app.noProjects") }}
      </div>
    </div>
  </div>
</template>
