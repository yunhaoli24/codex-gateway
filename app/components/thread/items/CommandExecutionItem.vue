<script setup lang="ts">
import { CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, TerminalIcon, XCircleIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { truncateText } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()
const { t } = useI18n()
const title = computed(() => props.item.command || 'Command')
const output = computed(() => truncateText(props.item.aggregatedOutput || props.item.result?.text || '', 1200))
const isInProgress = computed(() => {
  const status = props.item.status
  const value = typeof status === 'string' ? status : status?.type
  return value === 'inProgress' || value === 'running' || value === 'active'
})
</script>

<template>
  <div class="max-w-4xl text-[#8d9499]">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <TerminalIcon class="size-4" />
      <span class="truncate">{{ title }}</span>
      <Badge variant="secondary">{{ item.status }}</Badge>
      <CheckCircle2Icon v-if="item.exitCode === 0" class="size-4 text-emerald-600" />
      <XCircleIcon v-else-if="item.exitCode" class="size-4 text-red-600" />
    </div>
    <Collapsible v-slot="{ open }" class="mt-2 rounded-lg border border-black/10 bg-[#fbfbfb]">
      <CollapsibleTrigger class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]">
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
        <span class="min-w-0 flex-1 truncate text-[#5f6970]">{{ t('app.commandOutput') }}</span>
        <Badge v-if="isInProgress" variant="outline">{{ t('app.running') }}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre v-if="output" class="max-h-56 overflow-auto border-t border-black/10 bg-[#f6f6f6] p-3 text-xs leading-5 text-[#3d4145]">{{ output }}</pre>
        <div v-else class="border-t border-black/10 bg-[#f6f6f6] px-3 py-2 text-sm text-[#9aa1a6]">
          {{ t('app.waitingCommandOutput') }}
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
