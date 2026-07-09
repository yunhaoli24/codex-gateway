<script setup lang="ts">
import { TerminalIcon } from "@lucide/vue";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
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
  <header
    class="flex min-h-16 shrink-0 items-center gap-4 border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)]"
  >
    <div
      class="flex min-w-0 max-w-[min(36vw,32rem)] flex-[0_1_min(36vw,32rem)] items-center gap-3 overflow-hidden"
    >
      <h1 class="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold" :title="threadTitle">
        {{ threadTitle }}
      </h1>
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
        <span class="hidden lg:inline">{{ $t("app.openTerminal") }}</span>
      </Button>
    </div>
    <div class="relative z-10 flex min-w-0 flex-[1_1_auto] justify-center">
      <WorkspaceTabBar :tabs="tabs" @close-tab="emit('closeTab', $event)" />
    </div>
    <div class="flex shrink-0 items-center gap-2 text-ink-muted">
      <LanguageSwitcher />
    </div>
  </header>
</template>
