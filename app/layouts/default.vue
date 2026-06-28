<script setup lang="ts">
import ChatWorkspace from "@/components/chat/ChatWorkspace.vue";
import GatewaySidebar from "@/components/sidebar/GatewaySidebar.vue";
</script>

<template>
  <main data-testid="desktop-layout" class="h-[100dvh] overflow-hidden bg-[#f7f7f5] text-[#2b2d2f]">
    <div
      class="grid h-full min-h-0 grid-cols-[clamp(18rem,22vw,21rem)_minmax(0,1fr)] overflow-hidden"
    >
      <GatewaySidebar />
      <ChatWorkspace />
    </div>
  </main>
</template>
