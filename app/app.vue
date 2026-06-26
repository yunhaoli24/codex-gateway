<script setup lang="ts">
import { onMounted } from 'vue'
import { ref } from 'vue'
import ChatWorkspace from '@/components/chat/ChatWorkspace.vue'
import DesktopSidebar from '@/components/sidebar/DesktopSidebar.vue'
import { Toaster } from '@/components/ui/sonner'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const ready = ref(false)

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
    <div class="grid h-full min-h-0 grid-cols-[324px_1fr] overflow-hidden">
      <DesktopSidebar />
      <ChatWorkspace />
    </div>
  </main>
</template>
