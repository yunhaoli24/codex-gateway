<script setup lang="ts">
import { ListChecksIcon } from '@lucide/vue'
import { computed } from 'vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { threadItemText } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()
const text = computed(() => threadItemText(props.item))
</script>

<template>
  <div class="max-w-4xl text-[0.9375rem] leading-8 text-[#202225]">
    <div class="mb-2 flex items-center gap-2 text-[#9aa1a6]">
      <ListChecksIcon class="size-4" />
      <span>Plan</span>
    </div>
    <MarkdownContent :content="text" />
  </div>
</template>
