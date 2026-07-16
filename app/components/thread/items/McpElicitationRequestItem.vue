<script setup lang="ts">
import { ExternalLinkIcon, MessageCircleQuestionIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
const contentText = ref("{}");
const params = computed(() => props.item.params || {});
const requestId = computed(() => props.item.requestId);
const {
  canRespond,
  responding,
  respond: respondToRequest,
  respondWithParsedJson,
} = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});

async function respond(action: "accept" | "decline" | "cancel") {
  if (action === "accept") {
    return await respondWithParsedJson(contentText.value || "{}", (content) => ({
      action,
      content,
      _meta: null,
    }));
  }
  return await respondToRequest({ action, content: null, _meta: null });
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <MessageCircleQuestionIcon class="size-4 shrink-0" />
      <span class="font-medium"
        >{{ t("app.mcpElicitationRequest") }} · {{ params.serverName }}</span
      >
      <Badge variant="outline">{{ params.mode }}</Badge>
    </div>
    <div class="mt-2">{{ params.message }}</div>
    <a
      v-if="params.url"
      :href="params.url"
      target="_blank"
      rel="noreferrer"
      class="mt-2 inline-flex items-center gap-1 text-primary underline"
    >
      <ExternalLinkIcon class="size-3" />
      {{ params.url }}
    </a>
    <div v-if="params.requestedSchema" class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-primary">{{ t("app.schema") }}</div>
      <ScrollArea class="h-40 rounded-md bg-surface/80">
        <pre class="p-2 text-xs">{{ jsonPreview(params.requestedSchema) }}</pre>
      </ScrollArea>
    </div>
    <Textarea
      v-if="canRespond"
      v-model="contentText"
      class="mt-3 min-h-24 bg-surface font-mono text-xs"
      :placeholder="t('app.jsonResponse')"
    />
    <div v-if="canRespond" class="mt-3 flex flex-wrap gap-2">
      <Button
        size="sm"
        :disabled="responding"
        data-testid="mcp-elicitation-accept"
        @click="respond('accept')"
      >
        {{ t("app.accept") }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="responding"
        data-testid="mcp-elicitation-decline"
        @click="respond('decline')"
      >
        {{ t("app.decline") }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="responding"
        data-testid="mcp-elicitation-cancel"
        @click="respond('cancel')"
      >
        {{ t("app.cancel") }}
      </Button>
    </div>
    <div v-else class="mt-3 rounded-md bg-surface/80 px-3 py-2 text-xs text-ink-muted">
      {{ t("app.serverRequestResolved") }}
    </div>
  </div>
</template>
