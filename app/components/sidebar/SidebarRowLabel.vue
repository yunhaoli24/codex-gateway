<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string | null;
}>();
</script>

<template>
  <span class="flex min-w-0 flex-1 items-center overflow-hidden text-left">
    <span class="min-w-0 flex-1 overflow-hidden pr-2">
      <span class="flex w-full min-w-0 items-center gap-1.5">
        <slot name="title-prefix" />
        <span class="block min-w-0 flex-1 truncate" :title="title">{{ title }}</span>
      </span>
      <span v-if="subtitle" class="block min-w-0 truncate text-xs text-ink-muted">
        {{ subtitle }}
      </span>
    </span>
    <span v-if="$slots.trailing" class="inline-flex size-4 shrink-0 items-center justify-center">
      <slot name="trailing" />
    </span>
  </span>
</template>
