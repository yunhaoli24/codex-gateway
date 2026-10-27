<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { AlertTriangleIcon, BellIcon, ChevronRightIcon, InfoIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Collapsible, CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import { Button } from "@codex-gateway/ui/button";
import DeferredCollapsibleContent from "@/components/common/DeferredCollapsibleContent.vue";

const props = defineProps<{ item: ThreadHistoryItem }>();
const { t } = useI18n();

const icon = computed(() => {
  if (props.item.level === "warning") return AlertTriangleIcon;
  if (props.item.level === "info") return InfoIcon;
  return BellIcon;
});
const title = computed(() => props.item.title || t("app.appServerNotification"));
const details = computed(() => props.item.details || "");
const isModerationMetadata = computed(() => props.item.method === "turn/moderationMetadata");
</script>

<template>
  <!-- Moderation metadata is diagnostic. Keep its summary and payload unmounted until the user
       opens the notice; collapsing only the JSON still leaves a noisy summary after every turn. -->
  <Collapsible
    :default-open="!isModerationMetadata"
    v-slot="{ open }"
    class="max-w-4xl rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink-secondary"
  >
    <component
      :is="isModerationMetadata ? CollapsibleTrigger : 'div'"
      class="flex w-full items-center gap-2 text-left"
    >
      <component :is="icon" class="size-4 shrink-0 text-ink-muted" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ title }}</span>
      <Badge v-if="item.method" variant="outline">{{ item.method }}</Badge>
      <ChevronRightIcon
        v-if="isModerationMetadata"
        class="size-4 shrink-0 text-ink-muted"
        :class="{ 'rotate-90': open }"
      />
    </component>
    <DeferredCollapsibleContent :open="open">
      <div v-if="item.message" class="mt-2 whitespace-pre-line leading-6 text-ink-muted">
        {{ item.message }}
      </div>
      <Collapsible v-if="details" v-slot="{ open: detailsOpen }" class="mt-2">
        <CollapsibleTrigger as-child>
          <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs">
            {{ detailsOpen ? t("app.hideNotificationDetails") : t("app.showNotificationDetails") }}
          </Button>
        </CollapsibleTrigger>
        <DeferredCollapsibleContent :open="detailsOpen">
          <pre
            class="mt-2 max-h-40 overflow-auto rounded-md bg-canvas-soft p-2 text-xs whitespace-pre-wrap wrap-anywhere leading-5 text-ink-secondary"
            >{{ details }}</pre>
        </DeferredCollapsibleContent>
      </Collapsible>
    </DeferredCollapsibleContent>
  </Collapsible>
</template>
