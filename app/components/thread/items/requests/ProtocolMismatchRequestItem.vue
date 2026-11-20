<script setup lang="ts">
import { threadItemStatusLabel } from "@/utils/thread-item-status";
import type { ThreadHistoryItem } from "~~/shared/types";
import { AlertTriangleIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import StaticJsonCodeBlock from "@/components/common/StaticJsonCodeBlock.vue";

const props = defineProps<{
  item: ThreadHistoryItem;
  title?: string;
  description?: string;
}>();

const { t } = useI18n();
const title = computed(() => props.title || props.item.method || t("app.protocolMismatch"));
const description = computed(() => props.description || t("app.protocolMismatchDescription"));
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive"
  >
    <div class="flex items-center gap-2">
      <AlertTriangleIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ title }}</span>
      <Badge variant="outline">{{ threadItemStatusLabel(item.status, t) }}</Badge>
    </div>
    <div class="mt-2">{{ description }}</div>
    <StaticJsonCodeBlock class="mt-3" :value="item.params" max-height="default" />
  </div>
</template>
