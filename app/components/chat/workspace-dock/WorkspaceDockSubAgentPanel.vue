<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";
import WorkspaceSubAgentPanel from "../WorkspaceSubAgentPanel.vue";
import type { WorkspaceDockPanelParamsFor } from "./types";
import { subAgentOwnedTurns } from "@/components/thread/subagent/subagent-turns";

const props = defineProps<{
  params: IDockviewPanelProps<WorkspaceDockPanelParamsFor<"subagent">>;
}>();
const threadView = useGatewayThreadViewStore();
const threadTurns = useGatewayThreadTurnsStore();
const { threadViews, visibleSubAgentPanels } = storeToRefs(threadView);
const { threadStatuses } = storeToRefs(useGatewayThreadRuntimeStore());
const panel = computed(() =>
  visibleSubAgentPanels.value.find(
    (candidate) =>
      candidate.hostId === props.params.params.subAgentHostId &&
      candidate.threadId === props.params.params.subAgentThreadId,
  ),
);
const panelKey = computed(() =>
  pinnedKey(props.params.params.subAgentHostId, props.params.params.subAgentThreadId),
);
const preview = computed(() => threadViews.value[panelKey.value] ?? null);
const turns = computed(() =>
  subAgentOwnedTurns(
    (preview.value?.currentThread as Record<string, unknown> | null) ?? null,
    preview.value?.history,
  ),
);
const title = computed(() => {
  const thread = preview.value?.currentThread as Record<string, any> | null;
  const metadataTitle =
    panel.value?.title && panel.value.title !== panel.value.threadId ? panel.value.title : null;
  return metadataTitle || (thread ? titleForThread(thread) : null) || panel.value?.threadId || "";
});

function interrupt() {
  if (!panel.value) return;
  void threadTurns.interruptThreadTurn({
    hostId: panel.value.hostId,
    threadId: panel.value.threadId,
    projectId: preview.value?.projectId ?? null,
  });
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceSubAgentPanel
      v-if="panel"
      :title="title"
      :panel="panel"
      :preview="preview"
      :turns="turns"
      :follow-key="[panelKey]"
      :status="threadStatuses[panelKey] ?? 'idle'"
      @interrupt="interrupt"
    />
  </div>
</template>
