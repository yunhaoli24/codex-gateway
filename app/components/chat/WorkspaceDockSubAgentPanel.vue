<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";
import WorkspaceSubAgentPanel from "./WorkspaceSubAgentPanel.vue";
import type { WorkspaceDockPanelParams } from "./workspace-dock-types";

const props = defineProps<{ params: IDockviewPanelProps<WorkspaceDockPanelParams> }>();
const gateway = useGatewayStore();
const threadTurns = useGatewayThreadTurnsStore();
const { threadViews, threadStatuses } = storeToRefs(gateway);
const panel = computed(() =>
  gateway.visibleSubAgentPanels.find(
    (candidate) =>
      candidate.hostId === props.params.params.subAgentHostId &&
      candidate.threadId === props.params.params.subAgentThreadId,
  ),
);
const panelKey = computed(() =>
  props.params.params.subAgentHostId && props.params.params.subAgentThreadId
    ? pinnedKey(props.params.params.subAgentHostId, props.params.params.subAgentThreadId)
    : "",
);
const preview = computed(() => threadViews.value[panelKey.value] ?? null);
const turns = computed(
  () => ((preview.value?.history as any)?.thread?.turns ?? []) as ThreadTimelineTurn[],
);
const title = computed(() => {
  const thread = preview.value?.currentThread as Record<string, any> | null;
  return (
    (thread ? titleForThread(thread) : null) || panel.value?.title || panel.value?.threadId || ""
  );
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
