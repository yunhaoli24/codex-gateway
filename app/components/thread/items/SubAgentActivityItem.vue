<script setup lang="ts">
import { GitBranchIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{ item: Record<string, any> }>()
const { t } = useI18n()

const title = computed(() => props.item.agentPath || props.item.agentThreadId || t('app.subAgentActivity'))
</script>

<template>
  <div class="max-w-[840px] text-[#5f6970]">
    <div class="flex items-center gap-2 text-[15px]">
      <GitBranchIcon class="size-4 text-[#8d9499]" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge v-if="item.kind" variant="secondary">{{ item.kind }}</Badge>
    </div>
    <div v-if="item.agentThreadId" class="mt-1 truncate font-mono text-xs text-[#9aa1a6]">
      {{ item.agentThreadId }}
    </div>
  </div>
</template>
