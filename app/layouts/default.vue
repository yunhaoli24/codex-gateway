<script setup lang="ts">
import ChatWorkspace from "@/components/chat/ChatWorkspace.vue";
import GatewaySidebar from "@/components/sidebar/GatewaySidebar.vue";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar";
</script>

<template>
  <main data-testid="desktop-layout" class="h-[100dvh] overflow-hidden bg-canvas-soft text-ink">
    <SidebarProvider class="h-full min-h-0">
      <Sidebar collapsible="offcanvas">
        <GatewaySidebar />
        <SidebarRail
          data-testid="desktop-sidebar-expand"
          :title="$t('app.openSidebar')"
          :aria-label="$t('app.openSidebar')"
        />
      </Sidebar>
      <SidebarInset class="h-full min-h-0 min-w-0 overflow-hidden">
        <ChatWorkspace />
      </SidebarInset>
    </SidebarProvider>
  </main>
</template>
