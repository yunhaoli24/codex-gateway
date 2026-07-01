<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { Tabs } from "@/components/ui/tabs";
import type { SubAgentPanelState } from "@/stores/gateway/types";
import SubAgentPanelBody from "@/components/thread/subagent/SubAgentPanelBody.vue";
import SubAgentPanelHeader from "@/components/thread/subagent/SubAgentPanelHeader.vue";
import { useGatewayStore } from "@/stores/gateway";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const { activeSubAgentPanel, activeSubAgentPanelKey, subAgentPanels, threadPreviews } =
  storeToRefs(store);
const { t } = useI18n();

const currentPanel = computed(() => activeSubAgentPanel.value ?? subAgentPanels.value[0] ?? null);
const previewKey = computed(() => {
  const panel = currentPanel.value;
  return panel ? pinnedKey(panel.hostId, panel.threadId) : null;
});
const preview = computed(() => {
  const key = previewKey.value;
  return key ? (threadPreviews.value[key] ?? null) : null;
});
const currentThread = computed(() => preview.value?.currentThread as Record<string, any> | null);
const title = computed(
  () =>
    (currentThread.value ? titleForThread(currentThread.value) : null) ||
    currentPanel.value?.title ||
    t("app.subAgentPanel"),
);
const turns = computed(() => {
  const history = preview.value?.history as any;
  return history?.thread?.turns || history?.turns || [];
});
const followKey = computed(() =>
  turns.value
    .flatMap((turn: any) => turn.items || [])
    .map((item: any) => `${item.id || item.type}:${item.aggregatedOutput?.length || 0}`)
    .join("|"),
);

function keyForPanel(panel: { hostId: number; threadId: string }) {
  return pinnedKey(panel.hostId, panel.threadId);
}

function activateTab(value: string | number) {
  const panel = subAgentPanels.value.find((item) => keyForPanel(item) === String(value));
  if (panel) {
    store.activateSubAgentPanel({ hostId: panel.hostId, threadId: panel.threadId });
  }
}

function closePanel(panel: SubAgentPanelState | null = currentPanel.value) {
  if (!panel) {
    return;
  }
  store.closeSubAgentPanel({ hostId: panel.hostId, threadId: panel.threadId });
}
</script>

<template>
  <Transition name="subagent-panel">
    <aside
      v-if="subAgentPanels.length && currentPanel"
      data-testid="subagent-panel"
      class="absolute inset-y-0 right-0 z-30 flex min-h-0 w-full flex-col overflow-hidden border-l border-hairline bg-surface/98 shadow-2xl backdrop-blur md:relative md:inset-auto md:z-auto md:basis-[28%] md:shrink-0 md:shadow-none"
    >
      <Tabs
        :model-value="activeSubAgentPanelKey || keyForPanel(currentPanel)"
        class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
        @update:model-value="activateTab"
      >
        <SubAgentPanelHeader
          :panels="subAgentPanels"
          :current-panel="currentPanel"
          :title="title"
          :loading="preview?.loading"
          @activate="activateTab"
          @close="closePanel"
          @close-current="closePanel()"
        />
        <SubAgentPanelBody
          :key="previewKey"
          :panel="currentPanel"
          :preview="preview"
          :turns="turns"
          :follow-key="followKey"
        />
      </Tabs>
    </aside>
  </Transition>
</template>

<style scoped>
.subagent-panel-enter-active,
.subagent-panel-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.subagent-panel-enter-from,
.subagent-panel-leave-to {
  opacity: 0;
  transform: translateX(12%);
}
</style>
