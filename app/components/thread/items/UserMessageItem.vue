<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import ThreadImageAttachment from '@/components/thread/attachments/ThreadImageAttachment.vue'
import { threadItemText } from '@/utils/thread-items'

const props = defineProps<{
  item: Record<string, any>
  hostId: number | null
  variant?: 'normal' | 'steer'
}>()

const { t } = useI18n()
const text = computed(() => threadItemText(props.item))
const imageParts = computed(() => {
  if (!Array.isArray(props.item.content)) {
    return []
  }
  return props.item.content
    .filter((part: any) => part?.type === 'image' || part?.type === 'localImage')
    .map((part: any, index: number) => ({
      id: `${props.item.id || props.item.clientId || 'image'}-${index}`,
      type: part.type,
      url: typeof part.url === 'string' ? part.url : '',
      path: typeof part.path === 'string' ? part.path : '',
      detail: part.detail || null,
    }))
})

function imageSource(image: { type: string, url: string, path: string }) {
  if (image.type === 'image') {
    return image.url
  }
  if (image.type === 'localImage' && props.hostId && image.path) {
    const query = new URLSearchParams({
      hostId: String(props.hostId),
      path: image.path,
    })
    return `/api/remote/images?${query.toString()}`
  }
  return ''
}
</script>

<template>
  <div class="flex justify-end">
    <div
      v-if="variant === 'steer'"
      data-testid="steered-conversation-item"
      class="max-w-[760px] space-y-3 rounded-xl border border-sky-200 bg-sky-50/70 px-5 py-4 text-[15px] leading-7 text-[#202225]"
    >
      <div class="flex items-center gap-2 text-sm font-medium text-sky-700">
        <Badge variant="outline" class="border-sky-300 bg-white/60 text-sky-700">{{ t('app.steeredConversation') }}</Badge>
      </div>
      <div v-if="imageParts.length" class="grid max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
        <template v-for="image in imageParts" :key="image.id">
          <ThreadImageAttachment
            v-if="imageSource(image)"
            :source="imageSource(image)"
            :label="image.path || null"
            :detail="image.detail"
          />
        </template>
      </div>
      <MarkdownContent v-if="text" :content="text" compact />
    </div>
    <div v-else class="max-w-[760px] space-y-3 rounded-2xl bg-[#f1f1f1] px-5 py-4 text-[15px] leading-7 text-[#202225]">
      <div v-if="imageParts.length" class="grid max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
        <template v-for="image in imageParts" :key="image.id">
          <ThreadImageAttachment
            v-if="imageSource(image)"
            :source="imageSource(image)"
            :label="image.path || null"
            :detail="image.detail"
          />
        </template>
      </div>
      <MarkdownContent v-if="text" :content="text" compact />
    </div>
  </div>
</template>
