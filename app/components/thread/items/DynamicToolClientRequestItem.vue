<script setup lang="ts">
import { WrenchIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useGatewayStore } from '@/stores/gateway'
import { jsonPreview } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()

const { t } = useI18n()
const store = useGatewayStore()
const responding = ref(false)
const responseText = ref('{\n  "contentItems": [\n    { "type": "inputText", "text": "" }\n  ],\n  "success": true\n}')
const params = computed(() => props.item.params || {})
const title = computed(() => [params.value.namespace, params.value.tool].filter(Boolean).join(' · ') || 'dynamic tool')

async function submit() {
  if (!props.item.requestId || !store.selectedThreadId) {
    return
  }
  const result = JSON.parse(responseText.value)
  responding.value = true
  try {
    await store.respondToServerRequest(store.selectedThreadId, props.item.requestId, result)
  } finally {
    responding.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
    <div class="flex items-center gap-2">
      <WrenchIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ t('app.dynamicToolRequest') }} · {{ title }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-sky-700">{{ t('app.arguments') }}</div>
      <ScrollArea class="h-40 rounded-md bg-white/80">
        <pre class="p-2 text-xs">{{ jsonPreview(params.arguments) }}</pre>
      </ScrollArea>
    </div>
    <div class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-sky-700">{{ t('app.dynamicToolResponse') }}</div>
      <Textarea v-model="responseText" class="min-h-32 bg-white font-mono text-xs" />
    </div>
    <div class="mt-3 flex gap-2">
      <Button size="sm" :disabled="responding" data-testid="dynamic-tool-submit" @click="submit">
        {{ t('app.submitResponse') }}
      </Button>
    </div>
  </div>
</template>
