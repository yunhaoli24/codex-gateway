<script setup lang="ts">
import { ExternalLinkIcon, MessageCircleQuestionIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useGatewayStore } from '@/stores/gateway'
import { jsonPreview } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()
const { t } = useI18n()
const store = useGatewayStore()
const responding = ref(false)
const contentText = ref('{}')
const params = computed(() => props.item.params || {})

async function respond(action: 'accept' | 'decline' | 'cancel') {
  if (!props.item.requestId || !store.selectedThreadId) {
    return
  }
  let content: unknown = null
  if (action === 'accept') {
    content = JSON.parse(contentText.value || '{}')
  }
  responding.value = true
  try {
    await store.respondToServerRequest(store.selectedThreadId, props.item.requestId, {
      action,
      content,
      _meta: null,
    })
  } finally {
    responding.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
    <div class="flex items-center gap-2">
      <MessageCircleQuestionIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t('app.mcpElicitationRequest') }} · {{ params.serverName }}</span>
      <Badge variant="outline">{{ params.mode }}</Badge>
    </div>
    <div class="mt-2">{{ params.message }}</div>
    <a v-if="params.url" :href="params.url" target="_blank" rel="noreferrer" class="mt-2 inline-flex items-center gap-1 text-sky-700 underline">
      <ExternalLinkIcon class="size-3" />
      {{ params.url }}
    </a>
    <div v-if="params.requestedSchema" class="mt-3">
      <div class="mb-1 text-xs font-medium uppercase text-sky-700">{{ t('app.schema') }}</div>
      <ScrollArea class="h-40 rounded-md bg-white/80">
        <pre class="p-2 text-xs">{{ jsonPreview(params.requestedSchema) }}</pre>
      </ScrollArea>
    </div>
    <Textarea v-model="contentText" class="mt-3 min-h-24 bg-white font-mono text-xs" :placeholder="t('app.jsonResponse')" />
    <div class="mt-3 flex flex-wrap gap-2">
      <Button size="sm" :disabled="responding" data-testid="mcp-elicitation-accept" @click="respond('accept')">
        {{ t('app.accept') }}
      </Button>
      <Button size="sm" variant="outline" :disabled="responding" data-testid="mcp-elicitation-decline" @click="respond('decline')">
        {{ t('app.decline') }}
      </Button>
      <Button size="sm" variant="outline" :disabled="responding" data-testid="mcp-elicitation-cancel" @click="respond('cancel')">
        {{ t('app.cancel') }}
      </Button>
    </div>
  </div>
</template>
