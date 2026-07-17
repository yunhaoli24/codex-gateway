<script setup lang="ts">
import type { TmuxPaneSnapshot, TmuxSessionSnapshot } from "~~/shared/types";
import TmuxSessionList from "./TmuxSessionList.vue";

defineProps<{
  hostId: number | null;
  sessions: TmuxSessionSnapshot[];
  monitoredPaneKeys: Set<string>;
  addingPaneKey: string | null;
}>();
const emit = defineEmits<{
  monitor: [pane: TmuxPaneSnapshot];
  preview: [pane: TmuxPaneSnapshot];
}>();
</script>

<template>
  <section>
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {{ $t("app.tmuxRemoteSessions") }}
    </h2>
    <div
      v-if="hostId === null"
      class="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-sm text-ink-muted"
    >
      {{ $t("app.tmuxChooseHostToScan") }}
    </div>
    <TmuxSessionList
      v-else
      :sessions="sessions"
      :monitored-pane-keys="monitoredPaneKeys"
      :adding-pane-key="addingPaneKey"
      @monitor="emit('monitor', $event)"
      @preview="emit('preview', $event)"
    />
  </section>
</template>
