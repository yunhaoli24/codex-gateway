<script setup lang="ts">
import { ActivityIcon } from "@lucide/vue";

defineProps<{
  activeCount: number;
}>();
</script>

<template>
  <header
    class="flex min-w-0 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3 py-2"
  >
    <ActivityIcon class="size-4 shrink-0 text-primary" />
    <div class="min-w-0 flex-1 truncate text-sm font-semibold">
      {{ $t("app.tmuxMonitors") }} · {{ activeCount }}
    </div>
  </header>
</template>
