<script setup lang="ts">
import type { HostRecord, TmuxPaneSnapshot } from "~~/shared/types";
import type { TmuxRemoteHostState } from "@/stores/gateway-tmux";
import TmuxRemoteHostNode from "./TmuxRemoteHostNode.vue";

defineProps<{
  hosts: HostRecord[];
  expandedHostIds: Set<number>;
  remoteStateFor: (hostId: number) => TmuxRemoteHostState;
  activeCountFor: (hostId: number) => number;
  monitoredPaneKeysFor: (hostId: number) => Set<string>;
  addingPaneKey: string | null;
}>();
const emit = defineEmits<{
  expand: [hostId: number, expanded: boolean];
  refresh: [hostId: number];
  check: [hostId: number];
  monitor: [hostId: number, pane: TmuxPaneSnapshot];
  preview: [hostId: number, pane: TmuxPaneSnapshot];
}>();
</script>

<template>
  <section>
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {{ $t("app.tmuxRemoteSessions") }}
    </h2>
    <div v-if="hosts.length" class="space-y-2">
      <TmuxRemoteHostNode
        v-for="host in hosts"
        :key="host.id"
        :host="host"
        :expanded="expandedHostIds.has(host.id)"
        :remote-state="remoteStateFor(host.id)"
        :active-count="activeCountFor(host.id)"
        :monitored-pane-keys="monitoredPaneKeysFor(host.id)"
        :adding-pane-key="addingPaneKey"
        @update:expanded="emit('expand', host.id, $event)"
        @refresh="emit('refresh', host.id)"
        @check="emit('check', host.id)"
        @monitor="emit('monitor', host.id, $event)"
        @preview="emit('preview', host.id, $event)"
      />
    </div>
    <div
      v-else
      class="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-sm text-ink-muted"
    >
      {{ $t("app.tmuxNoHosts") }}
    </div>
  </section>
</template>
