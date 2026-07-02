<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
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
import SidebarScrollArea from "./SidebarScrollArea.vue";
import ThreadRow from "./ThreadRow.vue";

const props = defineProps<{
  hosts: any[];
  projectsByHost: Map<number, any[]>;
  projectThreads: any[];
  expandedHostIds: Set<number>;
  expandedProjectIds: Set<number>;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
  hostConnectionStatuses: Record<number, { status: string; message?: string | null }>;
  renamingThreadId: string | null;
  renameValue: string;
  longPressHandlers?: Record<string, unknown>;
  threadRuntimeStatus: (hostId: number, threadId: string) => ThreadRuntimeStatus;
}>();

const emit = defineEmits<{
  selectHost: [hostId: number];
  addProject: [host: any];
  deleteHost: [hostId: number];
  selectProject: [projectId: number, event: MouseEvent];
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
  <section class="flex min-h-0 flex-col">
    <div class="px-2 pb-2 text-sm text-ink-muted">{{ $t("app.hosts") }}</div>
    <SidebarScrollArea>
      <div class="space-y-1 pr-1">
        <div v-for="host in hosts" :key="host.id" class="rounded-lg">
          <div class="flex items-center gap-1">
            <ContextMenu>
              <ContextMenuTrigger as-child>
                <Button
                  :data-testid="`host-button-${host.id}`"
                  v-bind="longPressHandlers"
                  variant="ghost"
                  class="h-11 min-w-0 flex-1 justify-start gap-2 rounded-lg px-3 text-left text-[0.9375rem] font-normal hover:bg-surface"
                  :class="selectedRowClass(host.id === selectedHostId)"
                  @click="emit('selectHost', host.id)"
                >
                  <ChevronDownIcon
                    v-if="expandedHostIds.has(host.id)"
                    class="size-3.5 shrink-0 text-ink-muted"
                  />
                  <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
                  <ServerIcon class="size-4 shrink-0" />
                  <span class="min-w-0">
                    <span class="block truncate">{{ host.name }}</span>
                    <span class="block truncate text-xs text-ink-muted">{{ host.sshHost }}</span>
                  </span>
                  <HostStatusIndicator
                    :status="hostConnectionStatus(host.id).status"
                    :label="hostConnectionStatus(host.id).message"
                  />
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-44">
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
            <Button
              variant="ghost"
              size="sm"
              class="size-8 shrink-0 p-0 text-destructive hover:text-destructive/80"
              :aria-label="$t('app.deleteHost')"
              @click="emit('deleteHost', host.id)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <div v-if="expandedHostIds.has(host.id)" class="mt-1 space-y-1 pl-5">
            <div
              v-for="project in projectsByHost.get(host.id) ?? []"
              :key="project.id"
              class="space-y-1"
            >
              <div @click.capture="emit('selectProject', project.id, $event)">
                <ContextMenu>
                  <ContextMenuTrigger as-child>
                    <Button
                      :data-testid="`project-button-${project.id}`"
                      v-bind="longPressHandlers"
                      variant="ghost"
                      class="h-10 w-full justify-start gap-2 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-surface"
                      :class="selectedRowClass(project.id === selectedProjectId)"
                    >
                      <ChevronDownIcon
                        v-if="expandedProjectIds.has(project.id)"
                        class="size-3.5 shrink-0 text-ink-muted"
                      />
                      <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
                      <FolderIcon class="size-4 shrink-0" />
                      <span class="truncate">{{ project.name }}</span>
                      <span class="ml-auto size-2 shrink-0 rounded-full bg-accent-green" />
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent class="w-44">
                    <ContextMenuItem @select="emit('editProject', project)">
                      <FolderOpenIcon class="mr-2 size-4" />
                      {{ $t("app.editProject") }}
                    </ContextMenuItem>
                    <ContextMenuItem @select="emit('startThreadInProject', project)">
                      <PlusIcon class="mr-2 size-4" />
                      {{ $t("app.newThread") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      class="text-destructive focus:text-destructive"
                      @select="emit('deleteProject', project.id)"
                    >
                      <Trash2Icon class="mr-2 size-4" />
                      {{ $t("app.deleteProject") }}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>

              <div v-if="expandedProjectIds.has(project.id)" class="space-y-1 pl-7">
                <template v-if="project.id === selectedProjectId && projectThreads.length">
                  <ThreadRow
                    v-for="thread in projectThreads"
                    :key="thread.id"
                    :thread="thread"
                    :test-id="`thread-button-${thread.id}`"
                    :selected="String(thread.id) === String(selectedThreadId)"
                    :status="threadRuntimeStatus(project.hostId, String(thread.id))"
                    :subtitle="formatRelative(thread.updatedAt)"
                    :rename-active="renamingThreadId === String(thread.id)"
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
                    @rename="emit('rename', thread)"
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

            <div
              v-if="!(projectsByHost.get(host.id) ?? []).length"
              class="rounded-lg px-3 py-2 text-xs text-ink-muted"
            >
              {{ $t("app.noProjects") }}
            </div>
          </div>
        </div>
      </div>
    </SidebarScrollArea>
  </section>
</template>
