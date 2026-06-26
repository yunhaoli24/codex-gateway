<script setup lang="ts">
import { onMounted } from 'vue'
import { ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const ready = ref(false)

onMounted(() => {
  ready.value = true
  void store.refresh()
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
