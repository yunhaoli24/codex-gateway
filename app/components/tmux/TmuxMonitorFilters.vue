<script setup lang="ts">
import type { HostRecord } from "~~/shared/types";
import type { TmuxThreadOption } from "@/composables/tmux/useTmuxMonitorDashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const props = defineProps<{
  hosts: HostRecord[];
  hostId: number | null;
  threads: TmuxThreadOption[];
  threadId: string | null;
}>();
const emit = defineEmits<{
  "update:hostId": [hostId: number | null];
  "update:threadId": [threadId: string | null];
}>();

function updateHost(value: unknown) {
  emit("update:hostId", value === "all" ? null : Number(value));
}

function updateThread(value: unknown) {
  emit("update:threadId", value === "all" ? null : String(value));
}
</script>

<template>
  <div class="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
    <Select
      :model-value="hostId === null ? 'all' : String(hostId)"
      @update:model-value="updateHost"
    >
      <SelectTrigger data-testid="tmux-host-filter" class="min-w-0 bg-surface">
        <SelectValue :placeholder="$t('app.tmuxAllHosts')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ $t("app.tmuxAllHosts") }}</SelectItem>
        <SelectItem
          v-for="host in props.hosts"
          :key="host.id"
          :value="String(host.id)"
          :data-testid="`tmux-host-option-${host.id}`"
        >
          {{ host.name || host.sshHost }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select
      :model-value="threadId || 'all'"
      :disabled="hostId === null"
      @update:model-value="updateThread"
    >
      <SelectTrigger data-testid="tmux-thread-filter" class="min-w-0 bg-surface">
        <SelectValue :placeholder="$t('app.tmuxAllThreadsHostBinding')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ $t("app.tmuxAllThreadsHostBinding") }}</SelectItem>
        <SelectItem
          v-for="thread in threads"
          :key="thread.threadId"
          :value="thread.threadId"
          :data-testid="`tmux-thread-option-${thread.threadId}`"
        >
          {{ thread.threadTitle }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
