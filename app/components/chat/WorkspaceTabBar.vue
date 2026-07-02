<script setup lang="ts">
import { MonitorIcon, TerminalIcon, XIcon } from "@lucide/vue";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkspaceTabState } from "@/stores/gateway/types";

defineProps<{
  tabs: WorkspaceTabState[];
  compact?: boolean;
}>();

const emit = defineEmits<{
  closeTerminal: [sessionId: string];
}>();
</script>

<template>
  <TabsList variant="line" class="min-w-0 max-w-full overflow-x-auto">
    <TabsTrigger
      v-for="tab in tabs"
      :key="tab.id"
      :value="tab.id"
      class="group min-w-0 flex-none gap-1.5 rounded-lg data-active:bg-canvas-soft data-active:text-ink data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
      :class="compact ? 'px-2' : 'px-2.5'"
    >
      <MonitorIcon v-if="tab.kind === 'agent'" class="size-3.5" />
      <TerminalIcon v-else class="size-3.5" />
      <span
        :class="compact ? 'max-w-[min(8rem,28vw)] truncate' : 'max-w-[min(14rem,35vw)] truncate'"
      >
        {{ tab.title }}
      </span>
      <button
        v-if="tab.kind === 'terminal' && tab.sessionId"
        type="button"
        class="ml-1 inline-flex size-4 items-center justify-center rounded-sm text-ink-muted opacity-70 hover:bg-surface hover:text-ink group-data-active:opacity-100"
        :aria-label="$t('app.closeTerminal')"
        @click.stop="emit('closeTerminal', tab.sessionId)"
      >
        <XIcon class="size-3" />
      </button>
    </TabsTrigger>
  </TabsList>
</template>
