<script setup lang="ts">
import {
  AlertCircleIcon,
  ClockIcon,
  InfinityIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
} from "@lucide/vue";
import { ref } from "vue";
import type { TmuxMonitor } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TmuxHostBadge from "./TmuxHostBadge.vue";
import TmuxPermanentMonitorDialog from "./TmuxPermanentMonitorDialog.vue";

defineProps<{
  monitors: TmuxMonitor[];
  hostNames: Record<number, string>;
  mode: "active" | "history";
  highlightedMonitorId?: number | null;
  promotingMonitorId?: number | null;
}>();
const emit = defineEmits<{
  preview: [monitor: TmuxMonitor];
  cancel: [monitor: TmuxMonitor];
  promote: [monitor: TmuxMonitor];
  retry: [monitor: TmuxMonitor];
}>();

const permanentCandidate = ref<{
  monitor: TmuxMonitor;
  action: "promote" | "retry";
} | null>(null);

function confirmPermanentAction() {
  if (!permanentCandidate.value) return;
  const { monitor, action } = permanentCandidate.value;
  if (action === "promote") emit("promote", monitor);
  else emit("retry", monitor);
  permanentCandidate.value = null;
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "";
}

function reasonKey(monitor: TmuxMonitor) {
  const keys = {
    returnedToShell: "app.tmuxReasonReturnedToShell",
    sessionExited: "app.tmuxReasonSessionExited",
    paneExited: "app.tmuxReasonPaneExited",
    paneReplaced: "app.tmuxReasonPaneReplaced",
    cancelled: "app.tmuxReasonCancelled",
  } as const;
  return monitor.completionReason ? keys[monitor.completionReason] : "app.tmuxRunning";
}
</script>

<template>
  <div v-if="monitors.length" class="space-y-2">
    <article
      v-for="monitor in monitors"
      :key="monitor.id"
      :data-testid="`tmux-monitor-${monitor.id}`"
      class="flex min-w-0 items-start gap-2 rounded-lg border bg-surface p-2 transition-colors"
      :class="
        monitor.id === highlightedMonitorId ? 'border-primary bg-primary/5' : 'border-hairline'
      "
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-start gap-3 rounded-md p-1 text-left outline-none transition-colors hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="$t('app.tmuxViewPaneOutput', { session: monitor.sessionName })"
        @click="emit('preview', monitor)"
      >
        <ClockIcon
          class="mt-0.5 size-4 shrink-0"
          :class="mode === 'active' ? 'text-accent-green' : 'text-ink-faint'"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="max-w-full truncate text-sm font-semibold" :title="monitor.sessionName">
              {{ monitor.sessionName }}
            </span>
            <Badge v-if="mode === 'history'" variant="outline">
              {{ $t(reasonKey(monitor)) }}
            </Badge>
            <Badge v-if="monitor.mode === 'permanent'" variant="secondary" class="gap-1">
              <InfinityIcon class="size-3" />
              {{
                mode === "active"
                  ? $t(
                      monitor.runStartedAt
                        ? "app.tmuxPermanentRunning"
                        : "app.tmuxPermanentWaiting",
                    )
                  : $t("app.tmuxPermanentMonitor")
              }}
            </Badge>
          </div>
          <div
            class="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted"
          >
            <TmuxHostBadge
              :host-id="monitor.hostId"
              :name="hostNames[monitor.hostId] || `Host ${monitor.hostId}`"
            />
            <span class="truncate" :title="monitor.threadTitle || undefined">
              {{ monitor.threadTitle || $t("app.tmuxHostLevelMonitor") }}
            </span>
          </div>
          <div class="mt-1 truncate font-mono text-xs text-ink-muted" :title="monitor.lastCommand">
            {{ monitor.lastCommand }}
          </div>
          <div class="mt-1.5 text-xs text-ink-faint">
            {{
              mode === "active"
                ? monitor.mode === "permanent" && !monitor.runStartedAt
                  ? $t("app.tmuxPermanentWaitingSince", { time: timestamp(monitor.createdAt) })
                  : $t("app.tmuxMonitoringSince", {
                      time: timestamp(monitor.runStartedAt || monitor.createdAt),
                    })
                : $t("app.tmuxCompletedAt", { time: timestamp(monitor.completedAt) })
            }}
          </div>
          <div
            v-if="monitor.lastError"
            class="mt-2 flex items-start gap-1.5 text-xs text-destructive"
          >
            <AlertCircleIcon class="mt-0.5 size-3.5 shrink-0" />
            <span>{{ $t("app.tmuxCheckFailed", { message: monitor.lastError }) }}</span>
          </div>
        </div>
      </button>
      <DropdownMenu v-if="mode === 'active' && monitor.mode === 'once'">
        <DropdownMenuTrigger as-child>
          <Button
            size="icon"
            variant="ghost"
            class="size-7 shrink-0 text-ink-muted"
            :disabled="promotingMonitorId === monitor.id"
            :aria-label="$t('app.tmuxMonitorActions')"
          >
            <LoaderCircleIcon
              v-if="promotingMonitorId === monitor.id"
              class="size-4 animate-spin"
            />
            <MoreHorizontalIcon v-else class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @select="permanentCandidate = { monitor, action: 'promote' }">
            {{ $t("app.tmuxPromotePermanent") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        v-if="mode === 'active'"
        size="sm"
        variant="ghost"
        class="h-7 shrink-0 text-ink-muted"
        @click="emit('cancel', monitor)"
      >
        {{
          monitor.mode === "permanent"
            ? $t("app.tmuxCancelPermanentMonitor")
            : $t("app.tmuxCancelMonitor")
        }}
      </Button>
      <Button
        v-else
        size="sm"
        variant="outline"
        class="h-7 shrink-0"
        @click="
          monitor.mode === 'permanent'
            ? (permanentCandidate = { monitor, action: 'retry' })
            : emit('retry', monitor)
        "
      >
        {{ $t("app.tmuxMonitorAgain") }}
      </Button>
    </article>
  </div>
  <div
    v-else
    class="rounded-lg border border-dashed border-hairline px-4 py-6 text-center text-sm text-ink-muted"
  >
    {{ mode === "active" ? $t("app.tmuxNoActiveMonitors") : $t("app.tmuxNoHistory") }}
  </div>
  <TmuxPermanentMonitorDialog
    :open="Boolean(permanentCandidate)"
    :session-name="permanentCandidate?.monitor.sessionName || ''"
    :pending="promotingMonitorId === permanentCandidate?.monitor.id"
    :promote="permanentCandidate?.action === 'promote'"
    @cancel="permanentCandidate = null"
    @confirm="confirmPermanentAction"
  />
</template>
