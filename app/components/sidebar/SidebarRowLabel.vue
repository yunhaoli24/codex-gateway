<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string | null;
}>();
</script>

<template>
  <span class="min-w-0 flex-1 pr-2 text-left">
    <span class="flex w-full min-w-0 items-center gap-1.5">
      <slot name="title-prefix" />
      <span class="block min-w-0 flex-1 truncate">{{ title }}</span>
    </span>
    <span v-if="subtitle" class="block min-w-0 truncate text-xs text-ink-muted">
      {{ subtitle }}
    </span>
  </span>
</template>
