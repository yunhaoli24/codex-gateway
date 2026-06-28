<script setup lang="ts">
import { AlertTriangleIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { jsonPreview } from '@/utils/thread-items'

const props = defineProps<{
  item: Record<string, any>
  title?: string
  description?: string
}>()

const { t } = useI18n()
const title = computed(() => props.title || props.item.method || t('app.protocolMismatch'))
const description = computed(() => props.description || t('app.protocolMismatchDescription'))
</script>

<template>
  <div class="max-w-4xl rounded-lg border border-red-300/70 bg-red-50 px-3 py-3 text-sm text-red-950">
    <div class="flex items-center gap-2">
      <AlertTriangleIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ title }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-2 text-red-900">{{ description }}</div>
    <ScrollArea class="mt-3 h-56 rounded-md bg-white/80">
      <pre class="p-2 text-xs">{{ jsonPreview(item.params) }}</pre>
    </ScrollArea>
  </div>
</template>
