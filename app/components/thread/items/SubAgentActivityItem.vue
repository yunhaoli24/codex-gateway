<script setup lang="ts">
import { GitBranchIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();

const title = computed(
  () => props.item.agentPath || props.item.agentThreadId || t("app.subAgentActivity"),
);
</script>

<template>
  <div class="max-w-4xl text-ink-secondary">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <GitBranchIcon class="size-4 text-ink-muted" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge v-if="item.kind" variant="secondary">{{ item.kind }}</Badge>
    </div>
    <div v-if="item.agentThreadId" class="mt-1 truncate font-mono text-xs text-ink-faint">
      {{ item.agentThreadId }}
    </div>
  </div>
</template>
