<script setup lang="ts">
import { TerminalIcon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { WorkspaceTabState } from "@/stores/gateway/types";
import WorkspaceTabBar from "./WorkspaceTabBar.vue";

defineProps<{
  tabs: WorkspaceTabState[];
  threadTitle: string;
  canOpenTerminal: boolean;
}>();

const emit = defineEmits<{
  openTerminal: [];
  closeTab: [tab: WorkspaceTabState];
}>();
</script>

<template>
  <header class="flex h-12 shrink-0 items-stretch border-b border-hairline">
    <div
      class="flex min-w-0 w-[10rem] shrink-0 items-center overflow-hidden border-r border-hairline px-[clamp(0.75rem,1.4vw,1rem)] xl:w-[12rem]"
    >
      <h1 class="min-w-0 truncate text-[0.9375rem] font-semibold" :title="threadTitle">
        {{ threadTitle }}
      </h1>
    </div>
    <div class="flex shrink-0 items-center border-r border-hairline px-2">
      <Button
        data-testid="open-terminal-button"
        variant="ghost"
        size="sm"
        class="h-8 shrink-0 rounded-md px-2 text-ink-muted hover:bg-canvas-soft hover:text-ink"
        :disabled="!canOpenTerminal"
        :aria-label="$t('app.openTerminal')"
        @click="emit('openTerminal')"
      >
        <TerminalIcon class="size-4" />
        <span>{{ $t("app.openTerminal") }}</span>
      </Button>
    </div>
    <div class="relative z-10 flex min-w-0 flex-1 justify-start px-3">
      <WorkspaceTabBar :tabs="tabs" @close-tab="emit('closeTab', $event)" />
    </div>
  </header>
</template>
