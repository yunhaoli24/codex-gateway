<script setup lang="ts">
import type { ThreadHistoryItem, ThreadResponseUsage } from "~~/shared/types";
import { computed } from "vue";
import { Message, MessageContent } from "@codex-gateway/ai-elements/message";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import AgentMessageActions from "@/components/thread/items/AgentMessageActions.vue";
import AsyncUserQuestionCard from "@/components/thread/items/AsyncUserQuestionCard.vue";
import { isItemInProgress, threadItemText } from "@/utils/thread-items";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
  turnTiming?: DisplayedTurnTiming | null;
  responseUsage?: ThreadResponseUsage[];
  agentActionsAvailable?: boolean;
}>();

const text = computed(() => threadItemText(props.item));
const inProgress = computed(() => isItemInProgress(props.item));
const hasAsyncQuestions = computed(
  () => props.item.delivery === "async" && (props.item.questions?.length ?? 0) > 0,
);
const hasFooter = computed(
  () =>
    Boolean(text.value) &&
    props.agentActionsAvailable === true &&
    (props.turnTiming != null || (props.responseUsage?.length ?? 0) > 0),
);
</script>

<template>
  <Message from="assistant" class="min-w-0 max-w-full lg:max-w-4xl">
    <MessageContent
      class="min-w-0 w-full gap-0 overflow-visible text-[0.9375rem] leading-8 text-ink"
    >
      <MarkdownContent :content="text" :streaming="inProgress" />
      <AsyncUserQuestionCard
        v-if="hasAsyncQuestions"
        :item="item"
        :host-id="hostId"
        :thread-id="threadId"
      />
      <AgentMessageActions
        v-if="hasFooter"
        :text="text"
        :turn-timing="turnTiming"
        :response-usage="responseUsage"
      />
    </MessageContent>
  </Message>
</template>
