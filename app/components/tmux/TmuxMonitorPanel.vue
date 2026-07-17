<script setup lang="ts">
import { LoaderCircleIcon } from "@lucide/vue";
import { useTmuxMonitorPanel } from "@/composables/tmux/useTmuxMonitorPanel";
import TmuxMonitorList from "./TmuxMonitorList.vue";
import TmuxMonitorToolbar from "./TmuxMonitorToolbar.vue";
import TmuxPaneOutputDialog from "./TmuxPaneOutputDialog.vue";
import TmuxRemoteHostTree from "./TmuxRemoteHostTree.vue";

const controller = useTmuxMonitorPanel();
const {
  tmux,
  dashboard,
  addingPaneKey,
  promotingMonitorId,
  expandedHostIds,
  panelRoot,
  preview,
  previewHostTitle,
} = controller;
</script>

<template>
  <section
    ref="panelRoot"
    data-testid="tmux-monitor-panel"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-canvas"
  >
    <TmuxMonitorToolbar :active-count="tmux.activeCount" />

    <div
      v-if="tmux.loading && !tmux.active.length && !tmux.history.length"
      class="grid min-h-0 flex-1 place-items-center"
    >
      <LoaderCircleIcon class="size-5 animate-spin text-ink-muted" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
      <div
        v-if="tmux.error"
        class="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {{ tmux.error }}
      </div>
      <div class="mx-auto max-w-5xl space-y-6">
        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxPermanentMonitors") }} · {{ tmux.permanentActive.length }}
          </h2>
          <TmuxMonitorList
            :monitors="tmux.permanentActive"
            :host-names="dashboard.hostNames.value"
            mode="active"
            :highlighted-monitor-id="tmux.highlightedMonitorId"
            @preview="controller.previewMonitor"
            @cancel="controller.cancelMonitor"
          />
        </section>

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxActiveMonitors") }} · {{ tmux.oneShotActive.length }}
          </h2>
          <TmuxMonitorList
            :monitors="tmux.oneShotActive"
            :host-names="dashboard.hostNames.value"
            mode="active"
            :highlighted-monitor-id="tmux.highlightedMonitorId"
            :promoting-monitor-id="promotingMonitorId"
            @preview="controller.previewMonitor"
            @cancel="controller.cancelMonitor"
            @promote="controller.promoteMonitor"
          />
        </section>

        <TmuxRemoteHostTree
          :hosts="dashboard.hosts.value"
          :expanded-host-ids="expandedHostIds"
          :remote-state-for="controller.remoteStateForHost"
          :active-count-for="controller.activeCountForHost"
          :monitors-for="controller.monitorsForHost"
          :adding-pane-key="addingPaneKey"
          :promoting-monitor-id="promotingMonitorId"
          @expand="controller.setHostExpanded"
          @refresh="tmux.refreshSessions"
          @check="tmux.checkNow"
          @monitor="controller.addMonitor"
          @promote="controller.promoteMonitor"
          @cancel="controller.cancelMonitor"
          @preview="controller.previewPane"
        />

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ $t("app.tmuxMonitorHistory") }}
          </h2>
          <TmuxMonitorList
            :monitors="tmux.history"
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
