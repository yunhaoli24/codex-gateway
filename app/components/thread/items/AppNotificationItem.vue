<script setup lang="ts">
import { AlertTriangleIcon, BellIcon, InfoIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();

const icon = computed(() => {
  if (props.item.level === "warning") return AlertTriangleIcon;
  if (props.item.level === "info") return InfoIcon;
  return BellIcon;
});
const title = computed(() => props.item.title || t("app.appServerNotification"));
const details = computed(() => props.item.details || "");
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <component :is="icon" class="size-4 shrink-0 text-ink-muted" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ title }}</span>
      <Badge v-if="item.method" variant="outline">{{ item.method }}</Badge>
    </div>
    <div v-if="item.message" class="mt-2 whitespace-pre-line leading-6 text-ink-muted">
      {{ item.message }}
    </div>
    <Collapsible v-if="details" v-slot="{ open }" class="mt-2">
      <CollapsibleTrigger as-child>
        <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs">
          {{ open ? t("app.hideNotificationDetails") : t("app.showNotificationDetails") }}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          class="mt-2 max-h-40 overflow-auto rounded-md bg-canvas-soft p-2 text-xs leading-5 text-ink-secondary"
          >{{ details }}</pre
        >
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
