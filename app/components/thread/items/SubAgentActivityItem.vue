<script setup lang="ts">
import { GitBranchIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
}>();
const { t } = useI18n();
const store = useGatewayStore();

const title = computed(
  () => props.item.agentPath || props.item.agentThreadId || t("app.subAgentActivity"),
);

function openSubAgent() {
  if (!props.hostId || !props.item.agentThreadId) {
    return;
  }
  void store.openSubAgentPanel({
    hostId: props.hostId,
    threadId: String(props.item.agentThreadId),
    title: title.value,
    parentHostId: store.selectedHostId,
    parentThreadId: store.selectedThreadId,
  });
}
</script>

<template>
  <Button
    v-if="item.agentThreadId"
    type="button"
    variant="ghost"
    class="h-auto w-full max-w-4xl justify-start rounded-xl px-2 py-2 text-left text-ink-secondary hover:bg-canvas-soft"
    data-testid="open-subagent-panel"
    @click="openSubAgent"
  >
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2 text-[0.9375rem]">
        <GitBranchIcon class="size-4 text-ink-muted" />
        <span class="min-w-0 truncate">{{ title }}</span>
        <Badge v-if="item.kind" variant="secondary">{{ item.kind }}</Badge>
        <Badge variant="outline" class="ml-auto">{{ t("app.openSubAgent") }}</Badge>
      </div>
      <div class="mt-1 truncate font-mono text-xs text-ink-faint">
        {{ item.agentThreadId }}
      </div>
    </div>
  </Button>

  <div v-else class="max-w-4xl text-ink-secondary">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <GitBranchIcon class="size-4 text-ink-muted" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge v-if="item.kind" variant="secondary">{{ item.kind }}</Badge>
    </div>
  </div>
</template>
