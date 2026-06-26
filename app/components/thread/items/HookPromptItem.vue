<script setup lang="ts">
import { WebhookIcon } from '@lucide/vue'
import { computed } from 'vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { threadItemText } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()
const { t } = useI18n()
const text = computed(() => threadItemText(props.item))
</script>

<template>
  <div class="max-w-[840px] rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-[#5f6970]">
    <div class="mb-2 flex items-center gap-2 text-[15px] font-medium text-amber-800">
      <WebhookIcon class="size-4" />
      <span>{{ t('app.hookPrompt') }}</span>
    </div>
    <MarkdownContent v-if="text" :content="text" compact />
  </div>
</template>
