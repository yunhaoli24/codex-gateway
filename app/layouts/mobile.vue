<script setup lang="ts">
import { MenuIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import ChatWorkspace from "@/components/chat/ChatWorkspace.vue";
import GatewaySidebar from "@/components/sidebar/GatewaySidebar.vue";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const navigation = useGatewayNavigationStore();
const { selectedProject } = storeToRefs(store);
const { selectedThreadId, selectedHostId, selectedProjectId } = storeToRefs(navigation);
const { currentThread } = storeToRefs(useGatewayThreadViewStore());
const sidebarOpen = ref(false);
const mobileTitle = computed(() => {
  if (selectedThreadId.value && currentThread.value) {
    return titleForThread(currentThread.value);
  }
  return selectedProject.value?.name || "Codex Gateway";
});

watch([selectedHostId, selectedProjectId, selectedThreadId], () => {
  sidebarOpen.value = false;
});
</script>

<template>
  <main
    data-testid="mobile-layout"
    class="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-canvas-soft text-ink"
  >
    <ChatWorkspace layout="mobile">
      <template #mobile-header-start>
        <Sheet v-model:open="sidebarOpen">
          <Button
            data-testid="mobile-sidebar-toggle"
            type="button"
            variant="ghost"
            size="icon-lg"
            class="shrink-0 rounded-xl"
            :aria-label="$t('app.openSidebar')"
            @click="sidebarOpen = true"
          >
            <MenuIcon class="size-5" />
          </Button>
          <SheetContent side="left" class="w-[min(88vw,24rem)] p-0" :show-close-button="false">
            <SheetHeader class="sr-only">
              <SheetTitle>{{ $t("app.sidebar") }}</SheetTitle>
              <SheetDescription>{{ $t("app.sidebarDescription") }}</SheetDescription>
            </SheetHeader>
            <GatewaySidebar class="h-full" :workspace-toolbar="false" />
          </SheetContent>
        </Sheet>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[0.9375rem] font-semibold">{{ mobileTitle }}</p>
          <p class="truncate text-xs text-ink-muted">Codex Gateway</p>
        </div>
      </template>
    </ChatWorkspace>
  </main>
</template>
