<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, ListTreeIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import ThreadItemView from '@/components/thread/ThreadItemView.vue'

const props = defineProps<{
  turn: Record<string, any>
  hostId: number | null
}>()

const { t } = useI18n()

const items = computed(() => Array.isArray(props.turn.items) ? props.turn.items : [])
const finalAgentIndex = computed(() => findFinalAgentIndex(items.value, props.turn.status))
const hasFinalAnswer = computed(() => finalAgentIndex.value >= 0)
const firstIntermediateIndex = computed(() => {
  const firstNonUser = items.value.findIndex((item: any) => item?.type !== 'userMessage')
  return firstNonUser >= 0 ? firstNonUser : items.value.length
})
const userItems = computed(() => hasFinalAnswer.value ? items.value.slice(0, firstIntermediateIndex.value) : items.value)
const intermediateItems = computed(() => {
  if (!hasFinalAnswer.value) {
    return []
  }
  return items.value.slice(firstIntermediateIndex.value, finalAgentIndex.value)
})
const finalItems = computed(() => {
  if (!hasFinalAnswer.value) {
    return []
  }
  return items.value.slice(finalAgentIndex.value)
})

function findFinalAgentIndex(turnItems: any[], status: unknown) {
  const explicitFinalIndex = findLastIndex(turnItems, (item) =>
    item?.type === 'agentMessage' && item?.phase === 'final_answer',
  )
  if (explicitFinalIndex >= 0) {
    return explicitFinalIndex
  }
  if (status !== 'completed') {
    return -1
  }
  return findLastIndex(turnItems, (item) => item?.type === 'agentMessage')
}

function findLastIndex<T>(list: T[], predicate: (item: T) => boolean) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) {
      return index
    }
  }
  return -1
}
</script>

<template>
  <div class="space-y-6">
    <ThreadItemView
      v-for="item in userItems"
      :key="item.id || item.clientId || `${item.type}-user-${JSON.stringify(item).length}`"
      :item="item"
      :host-id="hostId"
    />

    <Collapsible
      v-if="intermediateItems.length"
      v-slot="{ open }"
      class="max-w-[840px] rounded-lg border border-black/10 bg-[#fbfbfb] text-[#5f6970]"
    >
      <CollapsibleTrigger class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]">
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
        <ListTreeIcon class="size-4 shrink-0 text-[#9aa1a6]" />
        <span class="min-w-0 flex-1 truncate">{{ t('app.intermediateSteps') }}</span>
        <Badge variant="outline">{{ intermediateItems.length }}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="space-y-5 border-t border-black/10 px-3 py-4">
          <ThreadItemView
            v-for="item in intermediateItems"
            :key="item.id || `${item.type}-middle-${JSON.stringify(item).length}`"
            :item="item"
            :host-id="hostId"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <ThreadItemView
      v-for="item in finalItems"
      :key="item.id || `${item.type}-final-${JSON.stringify(item).length}`"
      :item="item"
      :host-id="hostId"
    />
  </div>
</template>
