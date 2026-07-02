<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, ListTreeIcon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { isThreadActiveStatus } from "~~/shared/thread-runtime-status";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";

const props = defineProps<{
  turn: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();

const items = computed(() => (Array.isArray(props.turn.items) ? props.turn.items : []));
const finalAgentIndex = computed(() => findFinalAgentIndex(items.value, props.turn.status));
const hasFinalAnswer = computed(() => finalAgentIndex.value >= 0);
const firstIntermediateIndex = computed(() => {
  const firstNonUser = items.value.findIndex(
    (item: any) => item?.type !== "userMessage" || isSteerUserMessage(item),
  );
  return firstNonUser >= 0 ? firstNonUser : items.value.length;
});
const userItems = computed(() => items.value.slice(0, firstIntermediateIndex.value));
const intermediateItems = computed(() => {
  if (hasFinalAnswer.value) {
    return items.value.slice(firstIntermediateIndex.value, finalAgentIndex.value);
  }
  return items.value.slice(firstIntermediateIndex.value);
});
const finalItems = computed(() => {
  if (!hasFinalAnswer.value) {
    return [];
  }
  return items.value.slice(finalAgentIndex.value);
});
const turnIsActive = computed(
  () =>
    isThreadActiveStatus(props.turn.status) ||
    items.value.some((item) => isThreadActiveStatus(item?.status)),
);
const intermediateOpen = ref(false);

watch(
  () => [
    statusValue(props.turn.status),
    ...items.value.map((item: any) => statusValue(item?.status)),
  ],
  () => {
    intermediateOpen.value = turnIsActive.value;
  },
  { immediate: true },
);

function findFinalAgentIndex(turnItems: any[], status: unknown) {
  const explicitFinalIndex = findLastIndex(
    turnItems,
    (item) => item?.type === "agentMessage" && item?.phase === "final_answer",
  );
  if (explicitFinalIndex >= 0) {
    return explicitFinalIndex;
  }
  if (status !== "completed") {
    return -1;
  }
  const finalAgentMessageIndex = findLastIndex(turnItems, (item) => item?.type === "agentMessage");
  if (finalAgentMessageIndex >= 0) {
    return finalAgentMessageIndex;
  }
  return findLastIndex(turnItems, (item) => item?.type === "appNotification");
}

function findLastIndex<T>(list: T[], predicate: (item: T) => boolean) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (item !== undefined && predicate(item)) {
      return index;
    }
  }
  return -1;
}

function userMessageVariant(item: any) {
  if (item?.type !== "userMessage") {
    return "normal";
  }
  if (isSteerUserMessage(item)) {
    return "steer";
  }
  const itemIndex = items.value.findIndex((candidate: any) => candidate === item);
  return firstNonUserIndex(itemIndex) >= 0 ? "steer" : "normal";
}

function isSteerUserMessage(item: any) {
  return (
    item?.type === "userMessage" &&
    typeof item.clientId === "string" &&
    item.clientId.startsWith("steer-")
  );
}

function firstNonUserIndex(beforeIndex: number) {
  return items.value.findIndex(
    (candidate: any, index) => index < beforeIndex && candidate?.type !== "userMessage",
  );
}

function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}
</script>

<template>
  <div class="space-y-6">
    <ThreadItemView
      v-for="item in userItems"
      :key="item.id || item.clientId || `${item.type}-user-${JSON.stringify(item).length}`"
      :item="item"
      :host-id="hostId"
      :thread-id="threadId"
      :user-message-variant="userMessageVariant(item)"
    />

    <Collapsible
      v-if="intermediateItems.length"
      v-model:open="intermediateOpen"
      v-slot="{ open }"
      class="max-w-4xl rounded-lg border border-hairline bg-surface text-ink-secondary"
    >
      <CollapsibleTrigger
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas-soft"
      >
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
        <ListTreeIcon class="size-4 shrink-0 text-ink-faint" />
        <span class="min-w-0 flex-1 truncate">{{ t("app.intermediateSteps") }}</span>
        <Badge variant="outline">{{ intermediateItems.length }}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div data-testid="intermediate-steps" class="space-y-5 border-t border-hairline px-3 py-4">
          <ThreadItemView
            v-for="item in intermediateItems"
            :key="item.id || `${item.type}-middle-${JSON.stringify(item).length}`"
            :item="item"
            :host-id="hostId"
            :thread-id="threadId"
            :user-message-variant="userMessageVariant(item)"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <ThreadItemView
      v-for="item in finalItems"
      :key="item.id || `${item.type}-final-${JSON.stringify(item).length}`"
      :item="item"
      :host-id="hostId"
      :thread-id="threadId"
      :user-message-variant="userMessageVariant(item)"
    />
  </div>
</template>
