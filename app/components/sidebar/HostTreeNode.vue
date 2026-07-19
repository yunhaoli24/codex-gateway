<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderXIcon,
  ServerIcon,
  Trash2Icon,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ThreadRuntimeStatus } from "@/stores/gateway";
import type { HostRecord, ProjectRecord, SidebarThread } from "./sidebar-types";
import { formatRelative, selectedRowClass } from "./sidebar-utils";
import HostStatusIndicator from "./HostStatusIndicator.vue";
import SidebarRowLabel from "./SidebarRowLabel.vue";
import SidebarProjectRow from "./SidebarProjectRow.vue";
import ThreadRow from "./ThreadRow.vue";

const props = defineProps<{
  host: HostRecord;
  availableProjects: ProjectRecord[];
  missingProjects: ProjectRecord[];
  projectThreads: SidebarThread[];
  expanded: boolean;
  expandedProjectIds: Set<number>;
  missingProjectsExpanded: boolean;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
  connectionStatus: { status: string; message?: string | null };
  renamingThreadKey: string | null;
  renameValue: string;
  longPressHandlers?: Record<string, unknown>;
  threadRuntimeStatus: (hostId: number, threadId: string) => ThreadRuntimeStatus;
  threadCompletionAttention: (hostId: number, threadId: string) => boolean;
}>();

const emit = defineEmits<{
  selectHost: [hostId: number];
  addProject: [host: HostRecord];
  deleteHost: [hostId: number];
  selectProject: [projectId: number, event: MouseEvent];
  toggleMissingProjects: [hostId: number];
  editProject: [project: ProjectRecord];
  deleteProject: [projectId: number];
  startThreadInProject: [project: ProjectRecord];
  openThread: [threadId: string, context: { hostId: number; projectId: number }];
  toggleThreadPin: [threadId: string, pinned: boolean];
  rename: [thread: SidebarThread & { hostId: number }];
  submitRename: [];
  renameKeydown: [event: KeyboardEvent];
  "update:renameValue": [value: string];
}>();
</script>

<template>
  <div class="min-w-0 overflow-hidden rounded-lg">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <Button
          :data-testid="`host-button-${host.id}`"
          v-bind="longPressHandlers"
          variant="ghost"
          class="h-11 w-full min-w-0 justify-start gap-2 overflow-hidden rounded-lg px-3 text-left text-[0.9375rem] font-normal hover:bg-surface"
          :class="selectedRowClass(host.id === selectedHostId)"
          @click="emit('selectHost', host.id)"
        >
          <ChevronDownIcon v-if="expanded" class="size-3.5 shrink-0 text-ink-muted" />
          <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
          <ServerIcon class="size-4 shrink-0" />
          <SidebarRowLabel :title="host.name" :subtitle="host.sshHost">
            <template #trailing>
              <HostStatusIndicator
                :status="connectionStatus.status"
                :label="connectionStatus.message"
              />
            </template>
          </SidebarRowLabel>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent :collision-padding="12" prioritize-position class="w-44">
        <ContextMenuItem @select="emit('addProject', host)">
          <FolderIcon class="mr-2 size-4" />
          {{ $t("app.addProject") }}
        </ContextMenuItem>
        <ContextMenuItem
          class="text-destructive focus:text-destructive"
          @select="emit('deleteHost', host.id)"
        >
          <Trash2Icon class="mr-2 size-4" />
          {{ $t("app.deleteHost") }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <div v-if="expanded" class="mt-1 min-w-0 space-y-1 overflow-hidden pl-5">
      <div
        v-for="project in availableProjects"
        :key="project.id"
        class="min-w-0 space-y-1 overflow-hidden"
      >
        <SidebarProjectRow
          :project="project"
          :expanded="expandedProjectIds.has(project.id)"
          :selected="project.id === selectedProjectId"
          :long-press-handlers="longPressHandlers"
          @select="emit('selectProject', project.id, $event)"
          @edit="emit('editProject', project)"
          @delete="emit('deleteProject', project.id)"
          @start-thread="emit('startThreadInProject', project)"
        />
        <div
          v-if="expandedProjectIds.has(project.id)"
          class="min-w-0 space-y-1 overflow-hidden pl-7"
        >
          <template v-if="project.id === selectedProjectId && projectThreads.length">
            <ThreadRow
              v-for="thread in projectThreads"
              :key="thread.id"
              :thread="thread"
              :test-id="`thread-button-${thread.id}`"
              :selected="String(thread.id) === String(selectedThreadId)"
              :status="threadRuntimeStatus(project.hostId, String(thread.id))"
              :completion-attention="threadCompletionAttention(project.hostId, String(thread.id))"
              :subtitle="formatRelative(thread.updatedAt)"
              :rename-active="renamingThreadKey === `${project.hostId}:${thread.id}`"
              :rename-value="renameValue"
              :pin-label="thread.pinned ? $t('app.unpinThread') : $t('app.pinThread')"
              :long-press-handlers="longPressHandlers"
              :show-pinned-icon="thread.pinned"
              @open="
                emit('openThread', String(thread.id), {
                  hostId: project.hostId,
                  projectId: project.id,
                })
              "
              @toggle-pin="emit('toggleThreadPin', String(thread.id), !thread.pinned)"
              @rename="emit('rename', { ...thread, hostId: project.hostId })"
              @submit-rename="emit('submitRename')"
              @rename-keydown="emit('renameKeydown', $event)"
              @update:rename-value="emit('update:renameValue', $event)"
            />
          </template>
          <div
            v-else-if="project.id === selectedProjectId"
            class="rounded-lg px-3 py-2 text-xs leading-5 text-ink-muted"
          >
            <div>{{ $t("app.noThreads") }}</div>
            <div>{{ $t("app.refreshThreadsHint") }}</div>
          </div>
        </div>
      </div>

      <div v-if="missingProjects.length" class="space-y-1">
        <Button
          :data-testid="`missing-projects-toggle-${host.id}`"
          variant="ghost"
          class="h-9 w-full justify-start gap-2 rounded-lg px-3 text-xs font-normal text-ink-muted hover:bg-surface"
          @click="emit('toggleMissingProjects', host.id)"
        >
          <ChevronDownIcon v-if="missingProjectsExpanded" class="size-3.5 shrink-0" />
          <ChevronRightIcon v-else class="size-3.5 shrink-0" />
          <FolderXIcon class="size-4 shrink-0 text-destructive/70" />
          <span class="min-w-0 flex-1 truncate text-left">{{ $t("app.missingProjects") }}</span>
          <span class="shrink-0 tabular-nums">{{ missingProjects.length }}</span>
        </Button>
        <div v-if="missingProjectsExpanded" class="space-y-1">
          <SidebarProjectRow
            v-for="project in missingProjects"
            :key="project.id"
            :project="project"
            :expanded="false"
            :selected="project.id === selectedProjectId"
            :missing="true"
            :long-press-handlers="longPressHandlers"
            @edit="emit('editProject', project)"
            @delete="emit('deleteProject', project.id)"
          />
        </div>
      </div>

      <div
        v-if="!availableProjects.length && !missingProjects.length"
        class="rounded-lg px-3 py-2 text-xs text-ink-muted"
      >
        {{ $t("app.noProjects") }}
      </div>
    </div>
  </div>
</template>
