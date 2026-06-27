<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ChatWorkspace from '@/components/chat/ChatWorkspace.vue'
import DesktopSidebar from '@/components/sidebar/DesktopSidebar.vue'
import { Toaster } from '@/components/ui/sonner'
import { useGatewayStore } from '@/stores/gateway'
import { titleForThread } from '@/stores/gateway/thread-utils'

const store = useGatewayStore()
const { currentThread, selectedThreadId } = storeToRefs(store)
const ready = ref(false)
const pageTitle = computed(() => {
  if (!selectedThreadId.value || !currentThread.value) {
    return 'Codex Gateway'
  }
  return `${titleForThread(currentThread.value)} - Codex Gateway`
})

useHead({
  title: pageTitle,
})

onMounted(async () => {
  try {
    await store.refresh()
  } finally {
    ready.value = true
  }
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <span v-if="ready" data-testid="app-ready" class="sr-only">ready</span>
  <Toaster rich-colors position="top-right" />
  <main class="h-screen overflow-hidden bg-[#f7f7f5] text-[#2b2d2f]">
    <div class="grid h-full min-h-0 grid-cols-[clamp(18rem,22vw,21rem)_minmax(0,1fr)] overflow-hidden">
      <DesktopSidebar />
      <ChatWorkspace />
    </div>
  </main>
</template>
