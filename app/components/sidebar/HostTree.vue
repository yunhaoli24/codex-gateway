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
import { formatRelative, selectedRowClass } from "./sidebar-utils";
import HostStatusIndicator from "./HostStatusIndicator.vue";
import SidebarRowLabel from "./SidebarRowLabel.vue";
import SidebarProjectRow from "./SidebarProjectRow.vue";
import ThreadRow from "./ThreadRow.vue";

const props = defineProps<{
  hosts: any[];
  availableProjectsByHost: Map<number, any[]>;
  missingProjectsByHost: Map<number, any[]>;
  projectThreads: any[];
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
  addProject: [host: any];
  deleteHost: [hostId: number];
  selectProject: [projectId: number, event: MouseEvent];
  toggleMissingProjects: [hostId: number];
  editProject: [project: any];
  deleteProject: [projectId: number];
  startThreadInProject: [project: any];
  openThread: [threadId: string, context: { hostId: number; projectId: number }];
  toggleThreadPin: [threadId: string, pinned: boolean];
  rename: [thread: any];
  submitRename: [];
  renameKeydown: [event: KeyboardEvent];
  "update:renameValue": [value: string];
}>();

function hostConnectionStatus(hostId: number) {
  return props.hostConnectionStatuses[hostId] ?? { status: "idle", message: null };
}
</script>

<template>
  <section class="flex min-w-0 max-w-full flex-col overflow-hidden">
    <div class="px-2 pb-2 text-sm text-ink-muted">{{ $t("app.hosts") }}</div>
    <div class="min-w-0 space-y-1 overflow-hidden">
      <div v-for="host in hosts" :key="host.id" class="min-w-0 overflow-hidden rounded-lg">
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
              <ChevronDownIcon
                v-if="expandedHostIds.has(host.id)"
                class="size-3.5 shrink-0 text-ink-muted"
              />
              <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
              <ServerIcon class="size-4 shrink-0" />
              <SidebarRowLabel :title="host.name" :subtitle="host.sshHost">
                <template #trailing>
                  <HostStatusIndicator
                    :status="hostConnectionStatus(host.id).status"
                    :label="hostConnectionStatus(host.id).message"
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

        <div
          v-if="expandedHostIds.has(host.id)"
          class="mt-1 min-w-0 space-y-1 overflow-hidden pl-5"
        >
          <div
            v-for="project in availableProjectsByHost.get(host.id) ?? []"
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
                  :completion-attention="
                    threadCompletionAttention(project.hostId, String(thread.id))
                  "
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

          <div v-if="(missingProjectsByHost.get(host.id) ?? []).length" class="space-y-1">
            <Button
              :data-testid="`missing-projects-toggle-${host.id}`"
              variant="ghost"
              class="h-9 w-full justify-start gap-2 rounded-lg px-3 text-xs font-normal text-ink-muted hover:bg-surface"
              @click="emit('toggleMissingProjects', host.id)"
            >
              <ChevronDownIcon
                v-if="expandedMissingProjectHostIds.has(host.id)"
                class="size-3.5 shrink-0"
              />
              <ChevronRightIcon v-else class="size-3.5 shrink-0" />
              <FolderXIcon class="size-4 shrink-0 text-destructive/70" />
              <span class="min-w-0 flex-1 truncate text-left">{{ $t("app.missingProjects") }}</span>
              <span class="shrink-0 tabular-nums">{{
                missingProjectsByHost.get(host.id)?.length
              }}</span>
            </Button>
            <div v-if="expandedMissingProjectHostIds.has(host.id)" class="space-y-1">
              <SidebarProjectRow
                v-for="project in missingProjectsByHost.get(host.id) ?? []"
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
            v-if="
              !(availableProjectsByHost.get(host.id) ?? []).length &&
              !(missingProjectsByHost.get(host.id) ?? []).length
            "
            class="rounded-lg px-3 py-2 text-xs text-ink-muted"
          >
            {{ $t("app.noProjects") }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
