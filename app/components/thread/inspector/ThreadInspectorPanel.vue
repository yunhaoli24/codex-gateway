<script setup lang="ts">
import {
  BotIcon,
  FileTextIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  SquareIcon,
  XIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, defineAsyncComponent, ref, watch } from "vue";
import type { FilePreviewTab } from "~~/shared/types";
import type { SubAgentPanelState } from "@/stores/gateway/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SubAgentPanelBody from "@/components/thread/subagent/SubAgentPanelBody.vue";
import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayFilePreviewStore } from "@/stores/gateway-file-preview";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";

type InspectorTab =
  | { key: string; kind: "subagent"; title: string; subtitle: string; panel: SubAgentPanelState }
  | { key: string; kind: "file"; title: string; subtitle: string; file: FilePreviewTab };

const store = useGatewayStore();
const filePreview = useGatewayFilePreviewStore();
const threadTurns = useGatewayThreadTurnsStore();
const { activeSubAgentPanelKey, visibleSubAgentPanels, threadViews, threadStatuses } =
  storeToRefs(store);
const { t } = useI18n();
const FilePreviewPanelBody = defineAsyncComponent(
  () => import("@/components/thread/inspector/FilePreviewPanelBody.vue"),
);

const activeTabKey = ref<string | null>(null);
const visibleFiles = computed(() =>
  filePreview.visibleTabsFor(store.selectedHostId, store.selectedThreadId),
);
const tabs = computed<InspectorTab[]>(() => [
  ...visibleSubAgentPanels.value.map((panel) => subAgentTab(panel)),
  ...visibleFiles.value.map((file) => fileTab(file)),
]);
const currentTab = computed(() => {
  const active = activeTabKey.value;
  return tabs.value.find((tab) => tab.key === active) ?? tabs.value[0] ?? null;
});
const currentSubAgent = computed(() =>
  currentTab.value?.kind === "subagent" ? currentTab.value.panel : null,
);
const currentFile = computed(() =>
  currentTab.value?.kind === "file" ? currentTab.value.file : null,
);
const currentPreviewKey = computed(() => {
  const panel = currentSubAgent.value;
  return panel ? pinnedKey(panel.hostId, panel.threadId) : null;
});
const currentPreview = computed(() => {
  const key = currentPreviewKey.value;
  return key ? (threadViews.value[key] ?? null) : null;
});
const currentThread = computed(
  () => currentPreview.value?.currentThread as Record<string, any> | null,
);
const currentStatus = computed(() => {
  const key = currentPreviewKey.value;
  if (!key) {
    return "idle";
  }
  return threadStatuses.value[key] ?? "idle";
});
const currentTitle = computed(() => {
  if (currentTab.value?.kind === "file") {
    return currentTab.value.title;
  }
  return (
    (currentThread.value ? titleForThread(currentThread.value) : null) ||
    currentSubAgent.value?.title ||
    t("app.subAgentPanel")
  );
});
const currentSubtitle = computed(() => currentTab.value?.subtitle ?? "");
const subAgentTurns = computed(() => {
  const history = currentPreview.value?.history as any;
  return (history?.thread?.turns || history?.turns || []) as ThreadTimelineTurn[];
});
const followKey = computed(() => [currentPreviewKey.value]);

watch(
  () => filePreview.activeTabKey,
  (key) => {
    if (key && tabs.value.some((tab) => tab.key === key)) {
      activeTabKey.value = key;
    }
  },
);
watch(activeSubAgentPanelKey, (key) => {
  if (key && tabs.value.some((tab) => tab.key === key)) {
    activeTabKey.value = key;
  }
});
watch(
  tabs,
  (nextTabs) => {
    if (!nextTabs.length) {
      activeTabKey.value = null;
      return;
    }
    if (!activeTabKey.value || !nextTabs.some((tab) => tab.key === activeTabKey.value)) {
      activeTabKey.value = nextTabs[0]?.key ?? null;
    }
  },
  { immediate: true },
);

function subAgentTab(panel: SubAgentPanelState): InspectorTab {
  return {
    key: pinnedKey(panel.hostId, panel.threadId),
    kind: "subagent",
    title: panel.title || panel.threadId,
    subtitle: panel.threadId,
    panel,
  };
}

function fileTab(file: FilePreviewTab): InspectorTab {
  return {
    key: file.key,
    kind: "file",
    title: file.title,
    subtitle: file.path,
    file,
  };
}

function activateTab(value: string | number) {
  const key = String(value);
  const tab = tabs.value.find((item) => item.key === key);
  if (!tab) {
    return;
  }
  activeTabKey.value = key;
  if (tab.kind === "subagent") {
    store.activateSubAgentPanel({ hostId: tab.panel.hostId, threadId: tab.panel.threadId });
  } else {
    filePreview.activateTab(tab.key);
  }
}

function closeTab(tab: InspectorTab | null = currentTab.value) {
  if (!tab) {
    return;
  }
  if (tab.kind === "subagent") {
    store.closeSubAgentPanel({ hostId: tab.panel.hostId, threadId: tab.panel.threadId });
  } else {
    filePreview.closeTab(tab.key);
  }
}

async function interruptCurrentSubAgent() {
  const panel = currentSubAgent.value;
  const projectId = currentPreview.value?.projectId ?? null;
  if (!panel) {
    return;
  }
  await threadTurns.interruptThreadTurn({
    hostId: panel.hostId,
    threadId: panel.threadId,
    projectId,
  });
}
</script>

<template>
  <Transition name="inspector-panel">
    <aside
      v-if="tabs.length && currentTab"
      data-testid="thread-inspector-panel"
      class="absolute inset-y-0 right-0 z-30 flex min-h-0 w-full flex-col overflow-hidden border-l border-hairline bg-surface/98 shadow-2xl backdrop-blur md:relative md:inset-auto md:z-auto md:basis-[28%] md:shrink-0 md:shadow-none"
    >
      <Tabs
        :model-value="activeTabKey || undefined"
        class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
        @update:model-value="activateTab"
      >
        <header class="shrink-0 border-b border-hairline">
          <div class="flex min-h-12 items-center gap-2 px-3">
            <BotIcon v-if="currentTab.kind === 'subagent'" class="size-4 shrink-0 text-primary" />
            <FileTextIcon v-else class="size-4 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold" data-testid="inspector-panel-title">
                {{ currentTitle }}
              </div>
              <div class="truncate font-mono text-xs text-ink-faint">
                {{ currentSubtitle }}
              </div>
            </div>
            <Badge
              v-if="currentSubAgent && currentPreview?.loading"
              variant="outline"
              class="gap-1"
            >
              <Loader2Icon class="size-3 animate-spin" />
              {{ t("app.loadingSubAgent") }}
            </Badge>
            <Badge v-else-if="currentFile?.loading" variant="outline" class="gap-1">
              <Loader2Icon class="size-3 animate-spin" />
              {{ t("app.loadingFilePreview") }}
            </Badge>
            <Button
              v-if="currentSubAgent && currentStatus === 'running'"
              type="button"
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 rounded-full border-destructive/30 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              :aria-label="t('app.interruptSubAgent')"
              @click="interruptCurrentSubAgent"
            >
              <SquareIcon class="size-3 fill-current" />
              <span class="hidden sm:inline">{{ t("app.interruptSubAgent") }}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('app.closeInspectorPanel')"
              @click="closeTab()"
            >
              <PanelRightCloseIcon class="hidden size-4 md:block" />
              <XIcon class="size-4 md:hidden" />
            </Button>
          </div>
          <TabsList
            variant="line"
            class="flex h-auto justify-start gap-1 overflow-x-auto rounded-none bg-transparent px-2 pb-1 pt-0"
          >
            <div
              v-for="tab in tabs"
              :key="tab.key"
              class="flex max-w-[12rem] shrink-0 items-center rounded-lg border border-transparent bg-canvas-soft/70"
            >
              <TabsTrigger
                :value="tab.key"
                class="min-w-0 flex-1 justify-start px-2 py-1"
                data-testid="inspector-tab"
                @click="activateTab(tab.key)"
              >
                <BotIcon v-if="tab.kind === 'subagent'" class="size-3 shrink-0" />
                <FileTextIcon v-else class="size-3 shrink-0" />
                <span class="truncate">{{ tab.title }}</span>
              </TabsTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                class="mr-1"
                :aria-label="t('app.closeInspectorTab', { title: tab.title })"
                @click.stop="closeTab(tab)"
              >
                <XIcon class="size-3" />
              </Button>
            </div>
          </TabsList>
        </header>

        <SubAgentPanelBody
          v-if="currentSubAgent"
          :key="currentPreviewKey ?? 'empty-subagent-panel'"
          :panel="currentSubAgent"
          :preview="currentPreview"
          :turns="subAgentTurns"
          :follow-key="followKey"
        />
        <FilePreviewPanelBody v-else-if="currentFile" :key="currentFile.key" :tab="currentFile" />
      </Tabs>
    </aside>
  </Transition>
</template>

<style scoped>
.inspector-panel-enter-active,
.inspector-panel-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.inspector-panel-enter-from,
.inspector-panel-leave-to {
  opacity: 0;
  transform: translateX(12%);
}
</style>
