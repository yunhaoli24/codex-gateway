<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { AlertCircleIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import StaticJsonCodeBlock from "@/components/common/StaticJsonCodeBlock.vue";
import { threadItemStatusLabel } from "@/utils/thread-item-status";

const props = defineProps<{ item: ThreadHistoryItem }>();
const { t } = useI18n();
const title = computed(() => props.item.method || t("app.serverRequest"));
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange-deep"
  >
    <div class="flex items-center gap-2">
      <AlertCircleIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ t("app.serverRequestWaiting") }} · {{ title }}</span>
      <Badge variant="outline">{{ threadItemStatusLabel(item.status, t) }}</Badge>
    </div>
    <StaticJsonCodeBlock class="mt-2" :value="item.params ?? {}" />
  </div>
</template>
