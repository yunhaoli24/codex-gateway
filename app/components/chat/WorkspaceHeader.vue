<script setup lang="ts">
import { TerminalIcon } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import type { WorkspaceTabState } from "@/stores/gateway/types";
import WorkspaceTabBar from "./WorkspaceTabBar.vue";

defineProps<{
  tabs: WorkspaceTabState[];
  threadTitle: string;
  activeControllerCount: number;
  canOpenTerminal: boolean;
}>();

const emit = defineEmits<{
  openTerminal: [];
  closeTerminal: [sessionId: string];
}>();
</script>

<template>
  <header
    class="hidden min-h-16 shrink-0 items-center gap-4 border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)] md:flex"
  >
    <div class="flex min-w-0 items-center gap-3">
      <h1 class="truncate text-[0.9375rem] font-semibold">{{ threadTitle }}</h1>
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
    <div class="flex min-w-0 flex-1 justify-center">
      <WorkspaceTabBar :tabs="tabs" @close-terminal="emit('closeTerminal', $event)" />
    </div>
    <div class="flex items-center gap-2 text-ink-muted">
      <LanguageSwitcher />
      <Badge variant="secondary">{{ activeControllerCount }} {{ $t("app.active") }}</Badge>
    </div>
  </header>

  <header
    class="flex min-h-14 shrink-0 items-center gap-2 border-b border-hairline bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden"
  >
    <div class="flex min-w-0 basis-[34vw] flex-none items-center gap-2 overflow-hidden">
      <slot name="mobile-start" />
    </div>
    <div class="relative z-10 ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
      <WorkspaceTabBar compact :tabs="tabs" @close-terminal="emit('closeTerminal', $event)" />
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
