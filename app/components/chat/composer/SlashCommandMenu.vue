<script setup lang="ts">
import type { SlashMenuItem } from "@/composables/useSlashCommands";
import { Button } from "@/components/ui/button";

defineProps<{
  open: boolean;
  commands: SlashMenuItem[];
  selectedIndex: number;
}>();

const emit = defineEmits<{
  select: [command: SlashMenuItem];
  hover: [index: number];
}>();
</script>

<template>
  <div
    v-if="open"
    data-testid="slash-command-menu"
    class="absolute inset-x-2 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-hairline bg-surface p-1 shadow-xl shadow-ink/10"
    role="listbox"
  >
    <Button
      v-for="(command, index) in commands"
      :key="command.id"
      :data-testid="`slash-command-${command.id}`"
      type="button"
      variant="ghost"
      class="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-canvas-soft"
      :class="index === selectedIndex ? 'bg-canvas-soft text-ink' : 'text-ink-secondary'"
      role="option"
      :aria-selected="index === selectedIndex"
      @mouseenter="emit('hover', index)"
      @click="emit('select', command)"
    >
      <span class="font-mono text-sm text-primary">{{ command.command }}</span>
      <span class="min-w-0">
        <span class="block text-sm font-medium">{{ command.title }}</span>
        <span class="block truncate text-xs text-ink-muted">{{ command.description }}</span>
      </span>
    </Button>
  </div>
</template>
