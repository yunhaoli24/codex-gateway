<script setup lang="ts">
import { ActivityIcon, MonitorIcon } from "@lucide/vue";
import type {
  TmuxMonitor,
  TmuxMonitorMode,
  TmuxPaneSnapshot,
  TmuxSessionSnapshot,
} from "~~/shared/types";
import { monitorForPane } from "@/stores/gateway-tmux/pane-monitor";
import TmuxPaneMonitorActions from "./TmuxPaneMonitorActions.vue";

defineProps<{
  hostId: number;
  sessions: TmuxSessionSnapshot[];
  monitors: TmuxMonitor[];
  addingPaneKey: string | null;
  promotingMonitorId: number | null;
}>();
const emit = defineEmits<{
  monitor: [pane: TmuxPaneSnapshot, mode: TmuxMonitorMode];
  preview: [pane: TmuxPaneSnapshot];
  promote: [monitor: TmuxMonitor];
  cancel: [monitor: TmuxMonitor];
}>();

function addingKey(hostId: number, pane: TmuxPaneSnapshot) {
  return `${hostId}:${pane.sessionId}:${pane.paneId}`;
}
</script>

<template>
  <div v-if="sessions.length" class="space-y-3">
    <section
      v-for="session in sessions"
      :key="session.sessionId"
      :data-testid="`tmux-session-${session.name}`"
      class="overflow-hidden rounded-lg border border-hairline bg-surface"
    >
      <header class="flex items-center gap-2 border-b border-hairline bg-canvas-soft px-3 py-2">
        <MonitorIcon class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="session.name">
          {{ session.name }}
        </span>
        <span class="text-xs text-ink-faint">
          {{ $t("app.tmuxPaneCount", { count: session.panes.length }) }}
        </span>
      </header>
      <div class="divide-y divide-hairline">
        <div
          v-for="pane in session.panes"
          :key="pane.paneId"
          :data-testid="`tmux-pane-${session.name}-${pane.windowIndex}-${pane.paneIndex}`"
          class="flex min-w-0 items-center gap-3 px-3 py-2.5"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="$t('app.tmuxViewPaneOutput', { session: session.name })"
            @click="emit('preview', pane)"
          >
            <ActivityIcon
              class="size-4 shrink-0"
              :class="pane.running ? 'text-accent-green' : 'text-ink-faint'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2 text-sm">
                <span class="shrink-0 font-mono text-xs text-ink-muted">
                  {{ pane.windowIndex }}.{{ pane.paneIndex }}
                </span>
                <span class="truncate font-medium" :title="pane.windowName">
                  {{ pane.windowName || pane.paneId }}
                </span>
              </div>
              <div
                class="mt-0.5 truncate font-mono text-xs text-ink-muted"
                :title="pane.currentCommand"
              >
                {{ pane.currentCommand }}
              </div>
            </div>
          </button>
          <TmuxPaneMonitorActions
            :pane="pane"
            :monitor="monitorForPane(monitors, hostId, pane) || null"
            :pending="
              addingPaneKey === addingKey(hostId, pane) ||
              promotingMonitorId === monitorForPane(monitors, hostId, pane)?.id
            "
            @monitor="emit('monitor', pane, $event)"
            @preview="emit('preview', pane)"
            @promote="emit('promote', $event)"
            @cancel="emit('cancel', $event)"
          />
        </div>
      </div>
    </section>
  </div>
  <div
    v-else
    class="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-sm text-ink-muted"
  >
    {{ $t("app.tmuxNoSessions") }}
  </div>
</template>
