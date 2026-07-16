<script setup lang="ts">
import { WrenchIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";
import { jsonPreview } from "@/utils/thread-items";

const props = defineProps<{
  item: Record<string, any>;
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
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-primary">{{ t("app.arguments") }}</div>
      <ScrollArea class="h-40 rounded-md bg-surface/80">
        <pre class="p-2 text-xs">{{ jsonPreview(params.arguments) }}</pre>
      </ScrollArea>
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
