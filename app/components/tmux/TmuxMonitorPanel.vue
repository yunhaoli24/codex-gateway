<script setup lang="ts">
import { ActivityIcon, LoaderCircleIcon, RefreshCwIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { computed, ref, watch } from "vue";
import type { TmuxMonitor, TmuxPaneSnapshot } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { gatewayErrorMessage } from "@/utils/gateway-error";
import TmuxMonitorList from "./TmuxMonitorList.vue";
import TmuxSessionList from "./TmuxSessionList.vue";
import TmuxPaneOutputDialog from "./TmuxPaneOutputDialog.vue";

const props = defineProps<{ hostId: number }>();
const gateway = useGatewayStore();
const tmux = useGatewayTmuxStore();
const { t } = useI18n();
const state = computed(() => tmux.stateFor(props.hostId));
const hostTitle = computed(
  () => gateway.hosts.find((host) => host.id === props.hostId)?.name ?? `Host ${props.hostId}`,
);
const monitoredPaneKeys = computed(
  () => new Set(state.value.active.map((monitor) => `${monitor.sessionId}:${monitor.paneId}`)),
);
const previewPane = ref<TmuxPaneSnapshot | null>(null);

watch(
  () => props.hostId,
  (hostId) => void tmux.loadHost(hostId, { scan: true }),
  { immediate: true },
);

async function addMonitor(pane: TmuxPaneSnapshot) {
  try {
    await tmux.addMonitor(props.hostId, pane);
    toast.success(`${pane.sessionName} · ${pane.windowIndex}.${pane.paneIndex}`);
  } catch (error) {
    toast.error(gatewayErrorMessage(error, t("app.tmuxAddFailed")));
  }
}

async function cancelMonitor(monitor: TmuxMonitor) {
  try {
    await tmux.cancelMonitor(props.hostId, monitor.id);
  } catch (error) {
    toast.error(gatewayErrorMessage(error, t("app.tmuxCancelFailed")));
  }
}

async function monitorAgain(monitor: TmuxMonitor) {
  await tmux.refreshSessions(props.hostId);
  const session = state.value.sessions.find((candidate) => candidate.name === monitor.sessionName);
  const pane = session?.panes.find(
    (candidate) =>
      candidate.windowIndex === monitor.windowIndex &&
      candidate.paneIndex === monitor.paneIndex &&
      candidate.running,
  );
  if (!pane) {
    toast.error(state.value.error || t("app.tmuxPreviousPaneUnavailable"));
    return;
  }
  await addMonitor(pane);
}
</script>

<template>
  <section
    data-testid="tmux-monitor-panel"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-canvas"
  >
    <header class="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      <ActivityIcon class="size-4 text-primary" />
      <div class="min-w-0 flex-1 truncate text-sm font-semibold" :title="hostTitle">
        {{ hostTitle }}
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5"
        :disabled="state.scanning"
        @click="tmux.refreshSessions(hostId)"
      >
        <RefreshCwIcon class="size-3.5" :class="state.scanning ? 'animate-spin' : ''" />
        {{ $t("app.tmuxRefreshSessions") }}
      </Button>
      <Button
        size="sm"
        class="h-8"
        :disabled="state.scanning || !state.active.length"
        @click="tmux.checkNow(hostId)"
      >
        {{ $t("app.tmuxCheckNow") }}
      </Button>
    </header>

    <div
      v-if="state.loading && !state.sessions.length && !state.active.length"
      class="grid min-h-0 flex-1 place-items-center"
    >
      <LoaderCircleIcon class="size-5 animate-spin text-ink-muted" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
      <div
        v-if="state.error"
        class="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {{ state.error }}
      </div>
      <div class="mx-auto max-w-5xl space-y-6">
        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxActiveMonitors") }} · {{ state.active.length }}
          </h2>
          <TmuxMonitorList
            :monitors="state.active"
            mode="active"
            :highlighted-monitor-id="state.highlightedMonitorId"
            @cancel="cancelMonitor"
          />
        </section>

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxRemoteSessions") }}
          </h2>
          <TmuxSessionList
            :sessions="state.sessions"
            :monitored-pane-keys="monitoredPaneKeys"
            @monitor="addMonitor"
            @preview="previewPane = $event"
          />
        </section>

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxMonitorHistory") }}
          </h2>
          <TmuxMonitorList
            :monitors="state.history"
            mode="history"
            :highlighted-monitor-id="state.highlightedMonitorId"
            @retry="monitorAgain"
          />
        </section>
      </div>
    </div>
    <TmuxPaneOutputDialog
      :open="Boolean(previewPane)"
      :host-id="hostId"
      :host-title="hostTitle"
      :pane="previewPane"
      @update:open="(open) => !open && (previewPane = null)"
    />
  </section>
</template>
