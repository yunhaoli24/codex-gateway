<script setup lang="ts">
import { ActivityIcon, RefreshCwIcon } from "@lucide/vue";
import type { HostRecord } from "~~/shared/types";
import type { TmuxThreadOption } from "@/composables/tmux/useTmuxMonitorDashboard";
import { Button } from "@/components/ui/button";
import TmuxMonitorFilters from "./TmuxMonitorFilters.vue";

defineProps<{
  activeCount: number;
  hosts: HostRecord[];
  hostId: number | null;
  threads: TmuxThreadOption[];
  threadId: string | null;
  scanning: boolean;
  canCheck: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  check: [];
  "update:hostId": [hostId: number | null];
  "update:threadId": [threadId: string | null];
}>();
</script>

<template>
  <header class="shrink-0 space-y-2 border-b border-hairline bg-surface px-3 py-2">
    <div class="flex min-w-0 items-center gap-2">
      <ActivityIcon class="size-4 shrink-0 text-primary" />
      <div class="min-w-0 flex-1 truncate text-sm font-semibold">
        {{ $t("app.tmuxMonitors") }} · {{ activeCount }}
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5"
        :disabled="hostId === null || scanning"
        @click="emit('refresh')"
      >
        <RefreshCwIcon class="size-3.5" :class="scanning ? 'animate-spin' : ''" />
        {{ $t("app.tmuxRefreshSessions") }}
      </Button>
      <Button
        size="sm"
        class="h-8"
        :disabled="hostId === null || scanning || !canCheck"
        @click="emit('check')"
      >
        {{ $t("app.tmuxCheckNow") }}
      </Button>
    </div>
    <TmuxMonitorFilters
      :hosts="hosts"
      :host-id="hostId"
      :threads="threads"
      :thread-id="threadId"
      @update:host-id="emit('update:hostId', $event)"
      @update:thread-id="emit('update:threadId', $event)"
    />
  </header>
</template>
