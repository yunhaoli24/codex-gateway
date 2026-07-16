<script setup lang="ts">
import { BotIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { activeSubAgentsFromTurns } from "./active-subagents";

const props = defineProps<{
  turns: Array<Record<string, any>>;
  hostId: number | null;
  parentThreadId: string;
}>();
const threadView = useGatewayThreadViewStore();
const agents = computed(() => activeSubAgentsFromTurns(props.turns));

function open(agent: (typeof agents.value)[number]) {
  if (!props.hostId) return;
  void threadView.openSubAgentPanel({
    hostId: props.hostId,
    threadId: agent.threadId,
    title: agent.title,
    parentHostId: props.hostId,
    parentThreadId: props.parentThreadId,
  });
}
</script>

<template>
  <div
    v-if="agents.length"
    class="flex min-h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline bg-canvas-soft/55 px-3"
    data-testid="active-subagents"
  >
    <div class="flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-muted">
      <BotIcon class="size-3.5" />
      {{ $t("app.activeSubAgents") }}
      <Badge variant="secondary">{{ agents.length }}</Badge>
    </div>
    <Button
      v-for="agent in agents"
      :key="agent.threadId"
      variant="outline"
      size="sm"
      class="h-7 shrink-0 gap-1.5 px-2"
      :title="agent.threadId"
      data-testid="open-active-subagent"
      @click="open(agent)"
    >
      <span class="max-w-40 truncate">{{ agent.title }}</span>
      <span class="size-1.5 rounded-full bg-primary" />
    </Button>
  </div>
</template>
