<script setup lang="ts">
import { TerminalIcon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { WorkspaceTabState } from "@/stores/gateway/types";
import WorkspaceTabBar from "./WorkspaceTabBar.vue";

defineProps<{
  tabs: WorkspaceTabState[];
  canOpenTerminal: boolean;
}>();

const emit = defineEmits<{
  openTerminal: [];
  closeTab: [tab: WorkspaceTabState];
}>();
</script>

<template>
  <header
    class="flex min-h-14 shrink-0 items-center gap-2 border-b border-hairline bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur"
  >
    <div class="flex min-w-0 basis-[34vw] flex-none items-center gap-2 overflow-hidden">
      <slot name="start" />
    </div>
    <div class="relative z-10 ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
      <WorkspaceTabBar compact :tabs="tabs" @close-tab="emit('closeTab', $event)" />
      <Button
        data-testid="open-terminal-mobile-button"
        variant="ghost"
        size="sm"
        class="h-8 shrink-0 rounded-md px-2 text-ink-muted hover:bg-canvas-soft hover:text-ink"
        :disabled="!canOpenTerminal"
        :aria-label="$t('app.openTerminal')"
        @click="emit('openTerminal')"
      >
        <TerminalIcon class="size-4" />
      </Button>
    </div>
  </header>
</template>
