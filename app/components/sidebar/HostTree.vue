<script setup lang="ts">
import type { ThreadRuntimeStatus } from "@/stores/gateway";
import type { HostRecord, ProjectRecord, SidebarThread } from "./sidebar-types";
import HostTreeNode from "./HostTreeNode.vue";

const props = defineProps<{
  hosts: HostRecord[];
  availableProjectsByHost: Map<number, ProjectRecord[]>;
  missingProjectsByHost: Map<number, ProjectRecord[]>;
  projectThreads: SidebarThread[];
  expandedHostIds: Set<number>;
  expandedProjectIds: Set<number>;
  expandedMissingProjectHostIds: Set<number>;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
  hostConnectionStatuses: Record<number, { status: string; message?: string | null }>;
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

function connectionStatus(hostId: number) {
  return props.hostConnectionStatuses[hostId] ?? { status: "idle", message: null };
}
</script>

<template>
  <section class="flex min-w-0 max-w-full flex-col overflow-hidden">
    <div class="px-2 pb-2 text-sm text-ink-muted">{{ $t("app.hosts") }}</div>
    <div class="min-w-0 space-y-1 overflow-hidden">
      <HostTreeNode
        v-for="host in hosts"
        :key="host.id"
        :host="host"
        :available-projects="availableProjectsByHost.get(host.id) ?? []"
        :missing-projects="missingProjectsByHost.get(host.id) ?? []"
        :project-threads="projectThreads"
        :expanded="expandedHostIds.has(host.id)"
        :expanded-project-ids="expandedProjectIds"
        :missing-projects-expanded="expandedMissingProjectHostIds.has(host.id)"
        :selected-host-id="selectedHostId"
        :selected-project-id="selectedProjectId"
        :selected-thread-id="selectedThreadId"
        :connection-status="connectionStatus(host.id)"
        :renaming-thread-key="renamingThreadKey"
        :rename-value="renameValue"
        :long-press-handlers="longPressHandlers"
        :thread-runtime-status="threadRuntimeStatus"
        :thread-completion-attention="threadCompletionAttention"
        @select-host="emit('selectHost', $event)"
        @add-project="emit('addProject', $event)"
        @delete-host="emit('deleteHost', $event)"
        @select-project="(projectId, event) => emit('selectProject', projectId, event)"
        @toggle-missing-projects="emit('toggleMissingProjects', $event)"
        @edit-project="emit('editProject', $event)"
        @delete-project="emit('deleteProject', $event)"
        @start-thread-in-project="emit('startThreadInProject', $event)"
        @open-thread="(threadId, context) => emit('openThread', threadId, context)"
        @toggle-thread-pin="(threadId, pinned) => emit('toggleThreadPin', threadId, pinned)"
        @rename="emit('rename', $event)"
        @submit-rename="emit('submitRename')"
        @rename-keydown="emit('renameKeydown', $event)"
        @update:rename-value="emit('update:renameValue', $event)"
      />
    </div>
  </section>
</template>
