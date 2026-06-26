<script setup lang="ts">
import { BrainIcon } from '@lucide/vue'
import { computed } from 'vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { threadItemText } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()
const text = computed(() => threadItemText(props.item))
</script>

<template>
  <div class="max-w-[840px] text-[15px] leading-7 text-[#9aa1a6]">
    <div class="flex items-start gap-2">
      <BrainIcon class="size-4" />
      <MarkdownContent v-if="text" :content="text" compact />
      <span v-else>Thinking</span>
    </div>
  </div>
</template>
