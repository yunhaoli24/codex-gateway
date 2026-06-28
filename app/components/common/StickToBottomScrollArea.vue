<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onMounted, ref, watch } from 'vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStickToBottomScroll } from '@/composables/useStickToBottomScroll'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  viewportClass?: HTMLAttributes['class']
  contentClass?: HTMLAttributes['class']
  threshold?: number
  followKey?: unknown
}>(), {
  threshold: 120,
})

const scrollAreaRef = ref<any>(null)
const {
  contentRef,
  followLatest,
  scrollToBottom,
  resetFollowLatest,
  handleScroll,
} = useStickToBottomScroll(scrollAreaRef, {
  threshold: props.threshold,
})

watch(
  () => props.followKey,
  () => {
    if (followLatest.value) {
      void scrollToBottom()
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  resetFollowLatest()
})
</script>

<template>
  <ScrollArea
    ref="scrollAreaRef"
    :class="props.class"
    :viewport-class="props.viewportClass"
    @scroll.capture="handleScroll"
  >
    <div ref="contentRef" :class="props.contentClass">
      <slot />
    </div>
  </ScrollArea>
</template>
