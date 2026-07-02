<script setup lang="ts">
import { BotIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isItemInProgress } from "@/utils/thread-items";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
}>();
const { t } = useI18n();
const store = useGatewayStore();

const title = computed(() => props.item.tool || t("app.collabAgentToolCall"));
const agentRows = computed(() => {
  const rows = new Map<
    string,
    { threadId: string; status: string | null; message: string | null; receiver: boolean }
  >();
  const receiverThreadIds = Array.isArray(props.item.receiverThreadIds)
    ? props.item.receiverThreadIds
    : [];
  for (const threadId of receiverThreadIds) {
    const id = String(threadId);
    rows.set(id, { threadId: id, status: null, message: null, receiver: true });
  }
  for (const [threadId, state] of Object.entries(props.item.agentsStates || {})) {
    const id = String(threadId);
    const current = rows.get(id) || {
      threadId: id,
      status: null,
      message: null,
      receiver: false,
    };
    rows.set(id, {
      ...current,
      status: String((state as any)?.status || ""),
      message: (state as any)?.message ? String((state as any).message) : null,
    });
  }
  return [...rows.values()];
});

function openReceiverThread(threadId: string) {
  if (!props.hostId || !threadId) {
    return;
  }
  void store.openSubAgentPanel({
    hostId: props.hostId,
    threadId,
    title: `agent-${threadId.slice(0, 8)}`,
    parentHostId: store.selectedHostId,
    parentThreadId: store.selectedThreadId,
  });
}
</script>

<template>
  <div class="max-w-4xl text-ink-secondary">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <BotIcon class="size-4 text-ink-muted" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge variant="secondary">{{ item.status }}</Badge>
      <Badge v-if="isItemInProgress(item)" variant="outline">{{ t("app.running") }}</Badge>
    </div>
    <div v-if="agentRows.length" class="mt-2 flex flex-col gap-1.5">
      <Button
        v-for="agent in agentRows"
        :key="agent.threadId"
        type="button"
        variant="outline"
        class="h-auto w-full justify-start px-2 py-1.5 text-left"
        data-testid="open-collab-subagent-panel"
        @click="openReceiverThread(agent.threadId)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink-secondary">
              {{ agent.threadId }}
            </span>
            <Badge v-if="agent.status" variant="outline">{{ agent.status }}</Badge>
            <Badge v-else-if="agent.receiver" variant="secondary">
              {{ t("app.receiverThreads") }}
            </Badge>
          </div>
          <div v-if="agent.message" class="mt-1 truncate text-xs text-ink-muted">
            {{ agent.message }}
          </div>
        </div>
      </Button>
    </div>
  </div>
</template>
