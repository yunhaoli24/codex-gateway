<script setup lang="ts">
import { threadItemStatusLabel } from "@/utils/thread-item-status";
import { BotIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Button } from "@codex-gateway/ui/button";
import { isItemInProgress } from "@/utils/thread-items";
import { useOpenSubAgentPanel } from "@/composables/thread/useOpenSubAgentPanel";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";
import { subAgentDisplayName } from "@/components/thread/subagent/display-name";
import type { ThreadHistoryItem } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import {
  collabToolHasMessage,
  collabToolLabelKey,
} from "@/components/thread/subagent/presentation";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
}>();
const { t } = useI18n();
const threadView = useGatewayThreadViewStore();
const threadActivity = useGatewayThreadActivityStore();
const { openSubAgentPanel } = useOpenSubAgentPanel();

const title = computed(() => t(collabToolLabelKey(props.item.tool)));
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
  const agentStates = recordFromUnknown(props.item.agentsStates) ?? {};
  for (const [threadId, state] of Object.entries(agentStates)) {
    const id = String(threadId);
    const current = rows.get(id) || {
      threadId: id,
      status: null,
      message: null,
      receiver: false,
    };
    const stateRecord = recordFromUnknown(state);
    rows.set(id, {
      ...current,
      status: String(stateRecord?.status || ""),
      message: stateRecord?.message ? String(stateRecord.message) : null,
    });
  }
  return [...rows.values()];
});

function openReceiverThread(threadId: string) {
  void openSubAgentPanel({
    hostId: props.hostId,
    threadId,
  });
}

function agentName(threadId: string) {
  const thread = props.hostId
    ? threadView.threadViews[pinnedKey(props.hostId, threadId)]?.currentThread
    : null;
  const summary = props.hostId
    ? threadActivity.summariesByKey[pinnedKey(props.hostId, threadId)]
    : undefined;
  return subAgentDisplayName({
    thread: thread ?? summary,
    threadId,
    fallback: t("app.subAgentPanel"),
  });
}
</script>

<template>
  <div class="max-w-4xl text-ink-secondary">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <BotIcon class="size-4 text-ink-muted" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge variant="secondary">{{ threadItemStatusLabel(item.status, t) }}</Badge>
      <Badge v-if="isItemInProgress(item)" variant="outline">{{ t("app.running") }}</Badge>
    </div>
    <div
      v-if="collabToolHasMessage(item.tool) && item.prompt"
      class="mt-2 whitespace-pre-wrap rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm leading-6 text-ink"
    >
      <div class="mb-1 text-xs font-medium text-ink-muted">{{ t("app.subAgentInput") }}</div>
      {{ item.prompt }}
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
            <span class="min-w-0 flex-1 truncate text-sm text-ink-secondary">
              {{ agentName(agent.threadId) }}
            </span>
            <Badge v-if="agent.status" variant="outline">{{
              threadItemStatusLabel(agent.status, t)
            }}</Badge>
            <Badge v-else-if="agent.receiver" variant="secondary">
              {{ t("app.receiverThreads") }}
            </Badge>
          </div>
          <div
            class="mt-1 truncate font-mono text-xs text-ink-faint"
            data-testid="subagent-thread-id"
          >
            {{ agent.threadId }}
          </div>
          <div v-if="agent.message" class="mt-1 truncate text-xs text-ink-muted">
            {{ agent.message }}
          </div>
        </div>
      </Button>
    </div>
  </div>
</template>
