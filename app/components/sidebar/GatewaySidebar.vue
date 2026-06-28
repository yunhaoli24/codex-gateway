<script setup lang="ts">
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CirclePauseIcon,
  FolderIcon,
  Loader2Icon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  WifiIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";
import { useLongPressContextMenu } from "@/composables/useLongPressContextMenu";
import { type ThreadRuntimeStatus, useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils";

const store = useGatewayStore();
const { t } = useI18n();
const {
  hosts,
  threads,
  projects,
  pinnedThreads,
  openingPinnedThreadKey,
  threadStatuses,
  hostConnectionStatuses,
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
} = storeToRefs(store);
const showSettings = ref(false);
const verifyingHostId = ref<number | null>(null);
const verifyResults = ref<Record<number, { ok?: boolean; message: string }>>({});
const expandedHostIds = ref<Set<number>>(new Set());
const expandedProjectIds = ref<Set<number>>(new Set());
const renamingThreadId = ref<string | null>(null);
const renameValue = ref("");
const suppressTreeAutoExpand = ref(false);
const { longPressTriggered, longPressContextMenuHandlers } = useLongPressContextMenu();

defineOptions({
  inheritAttrs: false,
});

const projectThreads = computed(() =>
  threads.value.filter((thread) => !thread.pinned).slice(0, 20),
);
const selectedThreadIsPinned = computed(() => {
  if (!selectedHostId.value || !selectedThreadId.value) {
    return false;
  }
  return pinnedThreads.value.some(
    (thread) =>
      thread.hostId === selectedHostId.value &&
      String(thread.threadId) === String(selectedThreadId.value),
  );
});
const projectsByHost = computed(() => {
  const byHost = new Map<number, typeof projects.value>();
  for (const project of projects.value) {
    const group = byHost.get(project.hostId) ?? [];
    group.push(project);
    byHost.set(project.hostId, group);
  }
  return byHost;
});
function formatRelative(seconds?: number | null) {
  if (!seconds) return "";
  const diff = Math.max(1, Math.floor(Date.now() / 1000 - seconds));
  if (diff < 3600) return `${Math.floor(diff / 60) || 1}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d`;
  return `${Math.floor(diff / 604_800)}w`;
}

function openThread(
  threadId: string,
  context?: { hostId?: number; projectId?: number | null; replaceRoute?: boolean },
) {
  if (longPressTriggered.value) {
    return;
  }
  void store.openThread(threadId, context);
}

function openPinnedThread(thread: any) {
  if (longPressTriggered.value) {
    return;
  }
  suppressTreeAutoExpand.value = true;
  void store.openPinnedThread(thread).finally(async () => {
    await nextTick();
    expandedHostIds.value = new Set();
    expandedProjectIds.value = new Set();
    suppressTreeAutoExpand.value = false;
  });
}

function selectHost(hostId: number) {
  const next = new Set(expandedHostIds.value);
  if (next.has(hostId)) {
    next.delete(hostId);
  } else {
    next.add(hostId);
  }
  expandedHostIds.value = next;
  if (hostId !== selectedHostId.value) {
    void store.selectHost(hostId);
  }
}

function selectProject(projectId: number, event?: MouseEvent) {
  if (longPressTriggered.value) {
    return;
  }
  if (event && event.button !== 0) {
    return;
  }
  expandedProjectIds.value = new Set(expandedProjectIds.value).add(projectId);
  void store.selectProject(projectId);
}

function startThreadInProject(project: any) {
  void store.startThread(
    {
      model: store.defaultModel?.model || store.defaultModel?.id || undefined,
    },
    {
      hostId: project.hostId,
      projectId: project.id,
    },
  );
}

async function verifyHost(hostId: number) {
  verifyingHostId.value = hostId;
  try {
    const result = (await store.verifyHost(hostId)) as any;
    verifyResults.value[hostId] = {
      ok: Boolean(result.ok),
      message:
        result.stdout || result.stderr || (result.ok ? t("app.connected") : t("app.verifyFailed")),
    };
  } catch (error: any) {
    verifyResults.value[hostId] = {
      ok: false,
      message: error?.data?.message || error?.message || t("app.verifyFailed"),
    };
  } finally {
    verifyingHostId.value = null;
  }
}

async function deleteHost(hostId: number) {
  await store.deleteHost(hostId);
}

function subtitleForPinnedThread(thread: any) {
  const hostName = hosts.value.find((host) => host.id === thread.hostId)?.name;
  return [hostName, thread.projectName].filter(Boolean).join(" / ");
}

function pinnedThreadKey(thread: any) {
  return `${thread.hostId}:${pinnedThreadId(thread)}`;
}

function isSelectedPinnedThread(thread: any) {
  return (
    pinnedThreadId(thread) === String(selectedThreadId.value) &&
    thread.hostId === selectedHostId.value
  );
}

function pinnedThreadId(thread: any) {
  return String(thread.threadId ?? thread.id ?? "");
}

function currentThreadKey(threadId: string) {
  return selectedHostId.value ? `${selectedHostId.value}:${threadId}` : "";
}

function threadKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

function threadRuntimeStatus(hostId: number, threadId: string): ThreadRuntimeStatus {
  return threadStatuses.value[threadKey(hostId, threadId)] ?? "idle";
}

function pinnedRuntimeStatus(thread: any): ThreadRuntimeStatus {
  const key = pinnedThreadKey(thread);
  if (openingPinnedThreadKey.value === key) {
    return "running";
  }
  return threadRuntimeStatus(thread.hostId, String(thread.threadId));
}

function statusLabel(status: ThreadRuntimeStatus) {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "interrupted") return "已中断";
  return "空闲";
}

function statusClass(status: ThreadRuntimeStatus) {
  if (status === "running") return "text-sky-600";
  if (status === "completed") return "text-emerald-600";
  if (status === "failed") return "text-red-600";
  if (status === "interrupted") return "text-amber-600";
  return "text-[#9aa1a6]";
}

function hostConnectionStatus(hostId: number) {
  return hostConnectionStatuses.value[hostId] ?? { status: "idle" as const, message: null };
}

function hostConnectionLabel(hostId: number) {
  const connection = hostConnectionStatus(hostId);
  if (connection.status === "checkingVersion") return connection.message || "检查版本中";
  if (connection.status === "upgrading") return connection.message || "升级中";
  if (connection.status === "restarting") return connection.message || "重启中";
  if (connection.status === "connecting") return "连接中";
  if (connection.status === "connected") return "已连接";
  if (connection.status === "failed") return connection.message || "连接失败";
  return "未连接";
}

function hostConnectionClass(hostId: number) {
  const status = hostConnectionStatus(hostId).status;
  if (
    status === "checkingVersion" ||
    status === "upgrading" ||
    status === "restarting" ||
    status === "connecting"
  )
    return "text-sky-600";
  if (status === "connected") return "text-emerald-600";
  if (status === "failed") return "text-red-600";
  return "text-[#9aa1a6]";
}

function hostConnectionIsBusy(hostId: number) {
  const status = hostConnectionStatus(hostId).status;
  return (
    status === "checkingVersion" ||
    status === "upgrading" ||
    status === "restarting" ||
    status === "connecting"
  );
}

function startInlineRename(thread: any) {
  renamingThreadId.value = String(thread.threadId || thread.id);
  renameValue.value = titleForThread(thread);
  void nextTick(() => {
    document.querySelector<HTMLInputElement>('[data-testid="rename-thread-input"]')?.focus();
  });
}

async function submitRename() {
  const threadId = renamingThreadId.value ?? "";
  const name = renameValue.value.trim();
  if (!threadId || !name) {
    cancelRename();
    return;
  }
  const thread =
    threads.value.find((candidate) => String(candidate.id) === threadId) ||
    pinnedThreads.value.find((candidate) => String(candidate.threadId) === threadId);
  if (thread && titleForThread(thread) === name) {
    cancelRename();
    return;
  }
  await store.renameThread(threadId, name);
  renamingThreadId.value = null;
  renameValue.value = "";
}

function cancelRename() {
  renamingThreadId.value = null;
  renameValue.value = "";
}

function handleRenameKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
}

watch(
  selectedHostId,
  (hostId) => {
    if (suppressTreeAutoExpand.value) return;
    if (selectedThreadIsPinned.value) return;
    if (!hostId) return;
    expandedHostIds.value = new Set(expandedHostIds.value).add(hostId);
  },
  { immediate: true },
);

watch(
  selectedProjectId,
  (projectId) => {
    if (suppressTreeAutoExpand.value) return;
    if (selectedThreadIsPinned.value) return;
    if (!projectId) return;
    expandedProjectIds.value = new Set(expandedProjectIds.value).add(projectId);
  },
  { immediate: true },
);

watch(selectedThreadIsPinned, (isPinned) => {
  if (!isPinned) return;
  expandedHostIds.value = new Set();
  expandedProjectIds.value = new Set();
});
</script>

<template>
  <aside
    v-bind="$attrs"
    class="relative flex min-h-0 flex-col border-r border-black/10 bg-[#dcecf4]"
  >
    <ScrollArea class="min-h-0 flex-1 px-3">
      <div class="space-y-5 py-4">
        <section v-if="pinnedThreads.length">
          <div class="px-2 pb-2 text-sm text-[#8c969c]">{{ t("app.pinned") }}</div>
          <div class="space-y-1">
            <template v-for="thread in pinnedThreads" :key="pinnedThreadKey(thread)">
              <div v-if="renamingThreadId === pinnedThreadId(thread)" class="rounded-lg px-3 py-2">
                <Input
                  v-model="renameValue"
                  data-testid="rename-thread-input"
                  class="h-7 min-w-0 bg-white/80"
                  @keydown="handleRenameKeydown"
                  @keydown.enter.prevent="submitRename"
                  @blur="submitRename"
                />
              </div>
              <ContextMenu v-else>
                <ContextMenuTrigger as-child>
                  <Button
                    :data-testid="`pinned-thread-button-${pinnedThreadId(thread)}`"
                    v-bind="longPressContextMenuHandlers"
                    :data-selected="isSelectedPinnedThread(thread) ? 'true' : 'false'"
                    variant="ghost"
                    class="h-auto min-h-10 w-full justify-between rounded-lg px-3 py-2 text-sm font-normal hover:bg-black/5"
                    :class="isSelectedPinnedThread(thread) ? 'bg-[#c7ddeb]' : ''"
                    @click="openPinnedThread(thread)"
                  >
                    <span class="min-w-0 text-left">
                      <span class="flex min-w-0 items-center gap-1.5">
                        <StarIcon class="size-3.5 shrink-0 fill-current text-amber-500" />
                        <span class="block truncate">{{ titleForThread(thread) }}</span>
                      </span>
                      <span class="block truncate text-xs text-[#7e878d]">{{
                        subtitleForPinnedThread(thread) || formatRelative(thread.updatedAt)
                      }}</span>
                    </span>
                    <span
                      class="ml-2 inline-flex size-4 shrink-0 items-center justify-center"
                      :class="statusClass(pinnedRuntimeStatus(thread))"
                      :aria-label="statusLabel(pinnedRuntimeStatus(thread))"
                    >
                      <Loader2Icon
                        v-if="pinnedRuntimeStatus(thread) === 'running'"
                        class="size-3.5 animate-spin"
                      />
                      <CheckCircle2Icon
                        v-else-if="pinnedRuntimeStatus(thread) === 'completed'"
                        class="size-3.5"
                      />
                      <CircleAlertIcon
                        v-else-if="pinnedRuntimeStatus(thread) === 'failed'"
                        class="size-3.5"
                      />
                      <CirclePauseIcon
                        v-else-if="pinnedRuntimeStatus(thread) === 'interrupted'"
                        class="size-3.5"
                      />
                      <span v-else class="size-2 rounded-full bg-current opacity-50" />
                    </span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent class="w-40">
                  <ContextMenuItem @select="store.setPinnedThread(thread, false)">
                    {{ t("app.unpinThread") }}
                  </ContextMenuItem>
                  <ContextMenuItem @select="startInlineRename(thread)">
                    {{ t("app.renameThread") }}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </template>
          </div>
        </section>

        <section>
          <div class="px-2 pb-2 text-sm text-[#8c969c]">{{ t("app.hosts") }}</div>
          <div class="space-y-1">
            <div v-for="host in hosts" :key="host.id" class="rounded-lg">
              <div class="flex items-center gap-1">
                <Button
                  :data-testid="`host-button-${host.id}`"
                  variant="ghost"
                  class="h-11 min-w-0 flex-1 justify-start gap-2 rounded-lg px-3 text-left text-[0.9375rem] font-normal hover:bg-black/5"
                  :class="host.id === selectedHostId ? 'bg-[#c7ddeb]' : ''"
                  @click="selectHost(host.id)"
                >
                  <ChevronDownIcon
                    v-if="expandedHostIds.has(host.id)"
                    class="size-3.5 shrink-0 text-[#7e878d]"
                  />
                  <ChevronRightIcon v-else class="size-3.5 shrink-0 text-[#7e878d]" />
                  <ServerIcon class="size-4 shrink-0" />
                  <span class="min-w-0">
                    <span class="block truncate">{{ host.name }}</span>
                    <span class="block truncate text-xs text-[#7e878d]">{{ host.sshHost }}</span>
                  </span>
                  <span
                    class="ml-auto inline-flex size-4 shrink-0 items-center justify-center"
                    :class="hostConnectionClass(host.id)"
                    :title="hostConnectionLabel(host.id)"
                    :aria-label="hostConnectionLabel(host.id)"
                  >
                    <Loader2Icon
                      v-if="hostConnectionIsBusy(host.id)"
                      class="size-3.5 animate-spin"
                    />
                    <CheckCircle2Icon
                      v-else-if="hostConnectionStatus(host.id).status === 'connected'"
                      class="size-3.5"
                    />
                    <CircleAlertIcon
                      v-else-if="hostConnectionStatus(host.id).status === 'failed'"
                      class="size-3.5"
                    />
                    <span v-else class="size-2 rounded-full bg-current opacity-50" />
                  </span>
                </Button>
                <Button
                  :data-testid="`verify-host-button-${host.id}`"
                  variant="ghost"
                  size="sm"
                  class="size-8 shrink-0 p-0"
                  :aria-label="t('app.verifyHost')"
                  :disabled="verifyingHostId === host.id"
                  @click="verifyHost(host.id)"
                >
                  <Loader2Icon v-if="verifyingHostId === host.id" class="size-4 animate-spin" />
                  <WifiIcon v-else class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="size-8 shrink-0 p-0 text-red-600 hover:text-red-700"
                  :aria-label="t('app.deleteHost')"
                  @click="deleteHost(host.id)"
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </div>
              <div
                v-if="verifyResults[host.id]"
                class="truncate px-3 pb-2 text-[0.6875rem]"
                :class="verifyResults[host.id].ok ? 'text-emerald-700' : 'text-red-700'"
              >
                {{ verifyResults[host.id].message }}
              </div>

              <div v-if="expandedHostIds.has(host.id)" class="mt-1 space-y-1 pl-5">
                <div
                  v-for="project in projectsByHost.get(host.id) ?? []"
                  :key="project.id"
                  class="space-y-1"
                >
                  <div @click.capture="selectProject(project.id, $event)">
                    <ContextMenu>
                      <ContextMenuTrigger as-child>
                        <Button
                          :data-testid="`project-button-${project.id}`"
                          v-bind="longPressContextMenuHandlers"
                          variant="ghost"
                          class="h-10 w-full justify-start gap-2 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-black/5"
                          :class="project.id === selectedProjectId ? 'bg-[#c7ddeb]' : ''"
                        >
                          <ChevronDownIcon
                            v-if="expandedProjectIds.has(project.id)"
                            class="size-3.5 shrink-0 text-[#7e878d]"
                          />
                          <ChevronRightIcon v-else class="size-3.5 shrink-0 text-[#7e878d]" />
                          <FolderIcon class="size-4 shrink-0" />
                          <span class="truncate">{{ project.name }}</span>
                          <span class="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" />
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent class="w-44">
                        <ContextMenuItem @select="startThreadInProject(project)">
                          <PlusIcon class="mr-2 size-4" />
                          {{ t("app.newThread") }}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>

                  <div v-if="expandedProjectIds.has(project.id)" class="space-y-1 pl-7">
                    <template v-if="project.id === selectedProjectId && projectThreads.length">
                      <template v-for="thread in projectThreads" :key="thread.id">
                        <div
                          v-if="renamingThreadId === String(thread.id)"
                          class="rounded-lg px-3 py-1"
                        >
                          <Input
                            v-model="renameValue"
                            data-testid="rename-thread-input"
                            class="h-7 min-w-0 bg-white/80"
                            @keydown="handleRenameKeydown"
                            @keydown.enter.prevent="submitRename"
                            @blur="submitRename"
                          />
                        </div>
                        <ContextMenu v-else>
                          <ContextMenuTrigger as-child>
                            <Button
                              :data-testid="`thread-button-${thread.id}`"
                              v-bind="longPressContextMenuHandlers"
                              variant="ghost"
                              class="h-auto min-h-9 w-full justify-between rounded-lg px-3 py-2 text-sm font-normal hover:bg-black/5"
                              :class="thread.id === selectedThreadId ? 'bg-[#c7ddeb]' : ''"
                              @click="
                                openThread(String(thread.id), {
                                  hostId: project.hostId,
                                  projectId: project.id,
                                })
                              "
                            >
                              <span class="min-w-0 text-left">
                                <span class="flex min-w-0 items-center gap-1.5">
                                  <StarIcon
                                    v-if="thread.pinned"
                                    class="size-3.5 shrink-0 fill-current text-amber-500"
                                  />
                                  <span class="block truncate">{{ titleForThread(thread) }}</span>
                                </span>
                                <span class="block truncate text-xs text-[#7e878d]">{{
                                  formatRelative(thread.updatedAt)
                                }}</span>
                              </span>
                              <span
                                class="ml-2 inline-flex size-4 shrink-0 items-center justify-center"
                                :class="
                                  statusClass(
                                    threadRuntimeStatus(project.hostId, String(thread.id)),
                                  )
                                "
                                :aria-label="
                                  statusLabel(
                                    threadRuntimeStatus(project.hostId, String(thread.id)),
                                  )
                                "
                              >
                                <Loader2Icon
                                  v-if="
                                    threadRuntimeStatus(project.hostId, String(thread.id)) ===
                                    'running'
                                  "
                                  class="size-3.5 animate-spin"
                                />
                                <CheckCircle2Icon
                                  v-else-if="
                                    threadRuntimeStatus(project.hostId, String(thread.id)) ===
                                    'completed'
                                  "
                                  class="size-3.5"
                                />
                                <CircleAlertIcon
                                  v-else-if="
                                    threadRuntimeStatus(project.hostId, String(thread.id)) ===
                                    'failed'
                                  "
                                  class="size-3.5"
                                />
                                <CirclePauseIcon
                                  v-else-if="
                                    threadRuntimeStatus(project.hostId, String(thread.id)) ===
                                    'interrupted'
                                  "
                                  class="size-3.5"
                                />
                                <span v-else class="size-2 rounded-full bg-current opacity-50" />
                              </span>
                            </Button>
                          </ContextMenuTrigger>
                          <ContextMenuContent class="w-40">
                            <ContextMenuItem
                              @select="store.setThreadPinned(String(thread.id), !thread.pinned)"
                            >
                              {{ thread.pinned ? t("app.unpinThread") : t("app.pinThread") }}
                            </ContextMenuItem>
                            <ContextMenuItem @select="startInlineRename(thread)">
                              {{ t("app.renameThread") }}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </template>
                    </template>
                    <div
                      v-else-if="project.id === selectedProjectId"
                      class="rounded-lg px-3 py-2 text-xs leading-5 text-[#8c969c]"
                    >
                      <div>{{ t("app.noThreads") }}</div>
                      <div>{{ t("app.refreshThreadsHint") }}</div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="!(projectsByHost.get(host.id) ?? []).length"
                  class="rounded-lg px-3 py-2 text-xs text-[#8c969c]"
                >
                  {{ t("app.noProjects") }}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>

    <div class="shrink-0 border-t border-black/10 p-3">
      <Button
        data-testid="settings-toggle"
        variant="ghost"
        class="h-10 w-full justify-start gap-3 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-black/5"
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
        <DialogHeader class="border-b border-black/10 px-6 py-5">
          <DialogTitle class="text-lg">{{ t("app.settings") }}</DialogTitle>
          <DialogDescription>{{ t("app.settingsDescription") }}</DialogDescription>
        </DialogHeader>
        <div class="flex min-h-0 flex-1 overflow-hidden px-6 py-5">
          <SettingsPanel @close="showSettings = false" />
        </div>
      </DialogContent>
    </Dialog>
  </aside>
</template>
