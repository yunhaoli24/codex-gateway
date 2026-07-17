<script setup lang="ts">
import { ChevronRightIcon, LoaderCircleIcon, RefreshCwIcon, ServerIcon } from "@lucide/vue";
import type { HostRecord, TmuxMonitor, TmuxMonitorMode, TmuxPaneSnapshot } from "~~/shared/types";
import type { TmuxRemoteHostState } from "@/stores/gateway-tmux";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TmuxHostBadge from "./TmuxHostBadge.vue";
import TmuxSessionList from "./TmuxSessionList.vue";

defineProps<{
  host: HostRecord;
  expanded: boolean;
  remoteState: TmuxRemoteHostState;
  activeCount: number;
  monitors: TmuxMonitor[];
  addingPaneKey: string | null;
  promotingMonitorId: number | null;
}>();
const emit = defineEmits<{
  "update:expanded": [expanded: boolean];
  refresh: [];
  check: [];
  monitor: [pane: TmuxPaneSnapshot, mode: TmuxMonitorMode];
  promote: [monitor: TmuxMonitor];
  cancel: [monitor: TmuxMonitor];
  preview: [pane: TmuxPaneSnapshot];
}>();
</script>

<template>
  <Collapsible
    :open="expanded"
    :data-testid="`tmux-host-node-${host.id}`"
    class="overflow-hidden rounded-lg border border-hairline bg-surface"
    @update:open="emit('update:expanded', $event)"
  >
    <div class="flex min-w-0 items-center gap-2 px-2 py-2">
      <CollapsibleTrigger as-child>
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :data-testid="`tmux-host-toggle-${host.id}`"
        >
          <ChevronRightIcon
            class="size-4 shrink-0 text-ink-muted transition-transform"
            :class="expanded ? 'rotate-90' : ''"
          />
          <ServerIcon class="size-4 shrink-0 text-ink-muted" />
          <TmuxHostBadge :host-id="host.id" :name="host.name || host.sshHost" />
          <span class="min-w-0 truncate text-xs text-ink-faint" :title="host.sshHost">
            {{ host.sshHost }}
          </span>
        </button>
      </CollapsibleTrigger>
      <Button
        v-if="activeCount"
        size="sm"
        variant="ghost"
        class="h-7 shrink-0"
        :disabled="remoteState.scanning"
        @click="emit('check')"
      >
        {{ $t("app.tmuxCheckNow") }} · {{ activeCount }}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        class="size-7 shrink-0"
        :disabled="remoteState.scanning"
        :aria-label="$t('app.tmuxRefreshHostSessions', { host: host.name || host.sshHost })"
        @click="emit('refresh')"
      >
        <RefreshCwIcon class="size-3.5" :class="remoteState.scanning ? 'animate-spin' : ''" />
      </Button>
    </div>
    <CollapsibleContent>
      <div class="border-t border-hairline p-2 sm:p-3">
        <div
          v-if="remoteState.error"
          class="mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {{ remoteState.error }}
        </div>
        <div
          v-if="remoteState.scanning && !remoteState.sessions.length"
          class="grid py-8 place-items-center"
        >
          <LoaderCircleIcon class="size-5 animate-spin text-ink-muted" />
        </div>
        <TmuxSessionList
          v-else
          :host-id="host.id"
          :sessions="remoteState.sessions"
          :monitors="monitors"
          :adding-pane-key="addingPaneKey"
          :promoting-monitor-id="promotingMonitorId"
          @monitor="(pane, mode) => emit('monitor', pane, mode)"
          @promote="emit('promote', $event)"
          @cancel="emit('cancel', $event)"
          @preview="emit('preview', $event)"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
