<script setup lang="ts">
import { LoaderCircleIcon } from "@lucide/vue";
import { useTmuxMonitorPanel } from "@/composables/tmux/useTmuxMonitorPanel";
import TmuxMonitorList from "./TmuxMonitorList.vue";
import TmuxMonitorToolbar from "./TmuxMonitorToolbar.vue";
import TmuxPaneOutputDialog from "./TmuxPaneOutputDialog.vue";
import TmuxRemoteSessionsSection from "./TmuxRemoteSessionsSection.vue";

const controller = useTmuxMonitorPanel();
const {
  tmux,
  dashboard,
  remoteState,
  monitoredPaneKeys,
  addingPaneKey,
  preview,
  previewHostTitle,
} = controller;
</script>

<template>
  <section
    data-testid="tmux-monitor-panel"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-canvas"
  >
    <TmuxMonitorToolbar
      :active-count="tmux.activeCount"
      :hosts="dashboard.hosts.value"
      :host-id="tmux.selectedHostId"
      :threads="dashboard.threadOptions.value"
      :thread-id="tmux.selectedThreadId"
      :scanning="remoteState?.scanning || false"
      :can-check="Boolean(dashboard.selectedHostActiveCount.value)"
      @refresh="tmux.selectedHostId && tmux.refreshSessions(tmux.selectedHostId)"
      @check="tmux.selectedHostId && tmux.checkNow(tmux.selectedHostId)"
      @update:host-id="tmux.selectHost"
      @update:thread-id="tmux.selectThread"
    />

    <div
      v-if="tmux.loading && !tmux.active.length && !tmux.history.length"
      class="grid min-h-0 flex-1 place-items-center"
    >
      <LoaderCircleIcon class="size-5 animate-spin text-ink-muted" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
      <div
        v-if="tmux.error || remoteState?.error"
        class="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {{ tmux.error || remoteState?.error }}
      </div>
      <div class="mx-auto max-w-5xl space-y-6">
        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxActiveMonitors") }} · {{ dashboard.filteredActive.value.length }}
          </h2>
          <TmuxMonitorList
            :monitors="dashboard.filteredActive.value"
            :host-names="dashboard.hostNames.value"
            mode="active"
            :highlighted-monitor-id="tmux.highlightedMonitorId"
            @preview="controller.previewMonitor"
            @cancel="controller.cancelMonitor"
          />
        </section>

        <TmuxRemoteSessionsSection
          :host-id="tmux.selectedHostId"
          :sessions="remoteState?.sessions || []"
          :monitored-pane-keys="monitoredPaneKeys"
          :adding-pane-key="addingPaneKey"
          @monitor="controller.addMonitor"
          @preview="tmux.selectedHostId && controller.previewPane(tmux.selectedHostId, $event)"
        />

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxMonitorHistory") }}
          </h2>
          <TmuxMonitorList
            :monitors="dashboard.filteredHistory.value"
            :host-names="dashboard.hostNames.value"
            mode="history"
            :highlighted-monitor-id="tmux.highlightedMonitorId"
            @preview="controller.previewMonitor"
            @retry="controller.monitorAgain"
          />
        </section>
      </div>
    </div>
    <TmuxPaneOutputDialog
      :open="Boolean(preview)"
      :host-id="preview?.hostId || 0"
      :host-title="previewHostTitle"
      :pane="preview?.pane || null"
      @update:open="(open) => !open && (preview = null)"
    />
  </section>
</template>
