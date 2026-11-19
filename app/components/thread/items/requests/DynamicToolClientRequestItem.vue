<script setup lang="ts">
import { threadItemStatusLabel } from "@/utils/thread-item-status";
import type { ThreadHistoryItem } from "~~/shared/types";
import { WrenchIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Button } from "@codex-gateway/ui/button";
import { Textarea } from "@codex-gateway/ui/textarea";
import StaticJsonCodeBlock from "@/components/common/StaticJsonCodeBlock.vue";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const responseText = ref(
  '{\n  "contentItems": [\n    { "type": "inputText", "text": "" }\n  ],\n  "success": true\n}',
);
const params = computed(() => props.item.params || {});
const requestId = computed(() => props.item.requestId);
const { canRespond, responding, respondWithJson } = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});
const title = computed(
  () => [params.value.namespace, params.value.tool].filter(Boolean).join(" · ") || "dynamic tool",
);

async function submit() {
  await respondWithJson(responseText.value);
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <WrenchIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate font-medium"
        >{{ t("app.dynamicToolRequest") }} · {{ title }}</span
      >
      <Badge variant="outline">{{ threadItemStatusLabel(item.status, t) }}</Badge>
    </div>
    <div class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-primary">{{ t("app.arguments") }}</div>
      <StaticJsonCodeBlock :value="params.arguments" />
    </div>
    <div v-if="canRespond" class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-primary">
        {{ t("app.dynamicToolResponse") }}
      </div>
      <Textarea v-model="responseText" class="min-h-32 bg-surface font-mono text-xs" />
    </div>
    <div v-if="canRespond" class="mt-3 flex gap-2">
      <Button size="sm" :disabled="responding" data-testid="dynamic-tool-submit" @click="submit">
        {{ t("app.submitResponse") }}
      </Button>
    </div>
    <div v-else class="mt-3 rounded-md bg-surface/80 px-3 py-2 text-xs text-ink-muted">
      {{ t("app.serverRequestResolved") }}
    </div>
  </div>
</template>
