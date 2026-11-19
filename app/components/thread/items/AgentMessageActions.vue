<script setup lang="ts">
import { CheckIcon, CopyIcon } from "@lucide/vue";
import { useClipboard } from "@vueuse/core";
import { toRef } from "vue";
import { MessageAction, MessageActions } from "@codex-gateway/ai-elements/message";
import { toast } from "@codex-gateway/ui/sonner";
import TurnDurationLabel from "@/components/thread/TurnDurationLabel.vue";
import TurnUsageAmountLabel from "@/components/thread/TurnUsageAmountLabel.vue";
import MessageForkAction from "@/components/thread/items/actions/MessageForkAction.vue";
import type { ThreadHistoryItem } from "~~/shared/types";
import type { ThreadResponseUsage } from "~~/shared/thread-history/types";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  text: string;
  hostId: number | null;
  threadId: string | null;
  turnId?: string | null;
  item: ThreadHistoryItem;
  turnTiming?: DisplayedTurnTiming | null;
  responseUsage?: ThreadResponseUsage[];
}>();

const { t } = useI18n();
const { copy, copied, isSupported } = useClipboard({
  source: toRef(props, "text"),
  copiedDuring: 1200,
});

async function copyText() {
  if (!props.text || !isSupported.value) {
    toast.error(t("app.copyAgentOutputFailed"));
    return;
  }
  try {
    await copy();
    toast.success(t("app.agentOutputCopied"));
  } catch {
    toast.error(t("app.copyAgentOutputFailed"));
  }
}
</script>

<template>
  <!-- The parent mounts actions only after the existing intermediate-process disclosure closes. -->
  <!-- Mobile has no hover, so actions stay visible there and reveal on desktop hover/focus. -->
  <MessageActions
    data-testid="agent-message-actions"
    class="mt-2 flex items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
  >
    <TurnDurationLabel v-if="turnTiming" :timing="turnTiming" />
    <TurnUsageAmountLabel :usage="responseUsage" />
    <MessageForkAction
      v-if="hostId !== null && threadId !== null && turnId"
      :host-id="hostId"
      :thread-id="threadId"
      :turn-id="turnId"
      boundary="after"
      :item="item"
    />
    <MessageAction
      :tooltip="t('app.copyAgentOutput')"
      size="sm"
      class="size-8 p-0 text-ink-muted hover:bg-canvas-soft hover:text-ink"
      @click="copyText"
    >
      <CheckIcon v-if="copied" class="size-4 text-accent-green" />
      <CopyIcon v-else class="size-4" />
    </MessageAction>
  </MessageActions>
</template>
