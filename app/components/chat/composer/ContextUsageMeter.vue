<script setup lang="ts">
import { computed } from 'vue'
import type { ThreadTokenUsageState } from '~~/shared/types'

const props = defineProps<{
  tokenUsage: ThreadTokenUsageState | null
}>()

const { t } = useI18n()
const contextUsedPercent = computed(() => {
  const usage = props.tokenUsage
  const totalTokens = usage?.last?.totalTokens
  const contextWindow = usage?.modelContextWindow
  if (!totalTokens || !contextWindow) {
    return null
  }
  return Math.min(100, Math.max(0, Math.ceil((totalTokens / contextWindow) * 100)))
})
const contextUsageStyle = computed(() => {
  const percent = contextUsedPercent.value ?? 0
  return {
    background: `conic-gradient(#8f969d ${percent}%, #d8dde1 0)`,
  }
})
const contextUsageLabel = computed(() => contextUsedPercent.value == null ? null : `${contextUsedPercent.value}%`)
</script>

<template>
  <div v-if="contextUsageLabel" class="hidden items-center gap-2 text-base text-[#858b91] sm:flex" :title="t('app.contextUsage', { percent: contextUsedPercent })">
    <div
      class="flex size-6 items-center justify-center rounded-full"
      :style="contextUsageStyle"
    >
      <div class="size-3.5 rounded-full bg-white" />
    </div>
    <span>{{ contextUsageLabel }}</span>
  </div>
</template>
