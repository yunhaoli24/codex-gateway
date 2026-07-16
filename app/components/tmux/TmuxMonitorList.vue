<script setup lang="ts">
import { AlertCircleIcon, ClockIcon } from "@lucide/vue";
import type { TmuxMonitor } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

defineProps<{
  monitors: TmuxMonitor[];
  mode: "active" | "history";
  highlightedMonitorId?: number | null;
}>();
const emit = defineEmits<{
  cancel: [monitor: TmuxMonitor];
  retry: [monitor: TmuxMonitor];
}>();

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
      class="rounded-lg border bg-surface px-3 py-3 transition-colors"
      :class="
        monitor.id === highlightedMonitorId ? 'border-primary bg-primary/5' : 'border-hairline'
      "
    >
      <div class="flex min-w-0 items-start gap-3">
        <ClockIcon
          class="mt-0.5 size-4 shrink-0"
          :class="mode === 'active' ? 'text-accent-green' : 'text-ink-faint'"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="max-w-full truncate text-sm font-semibold" :title="monitor.sessionName">
              {{ monitor.sessionName }}
            </span>
            <Badge variant="secondary"> {{ monitor.windowIndex }}.{{ monitor.paneIndex }} </Badge>
            <Badge v-if="mode === 'history'" variant="outline">
              {{ $t(reasonKey(monitor)) }}
            </Badge>
          </div>
          <div class="mt-1 truncate font-mono text-xs text-ink-muted" :title="monitor.lastCommand">
            {{ monitor.lastCommand }}
          </div>
          <div class="mt-1.5 text-xs text-ink-faint">
            {{
              mode === "active"
                ? $t("app.tmuxMonitoringSince", { time: timestamp(monitor.createdAt) })
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
        <Button
          v-if="mode === 'active'"
          size="sm"
          variant="ghost"
          class="h-7 shrink-0 text-ink-muted"
          @click="emit('cancel', monitor)"
        >
          {{ $t("app.tmuxCancelMonitor") }}
        </Button>
        <Button
          v-else
          size="sm"
          variant="outline"
          class="h-7 shrink-0"
          @click="emit('retry', monitor)"
        >
          {{ $t("app.tmuxMonitorAgain") }}
        </Button>
      </div>
    </article>
  </div>
  <div
    v-else
    class="rounded-lg border border-dashed border-hairline px-4 py-6 text-center text-sm text-ink-muted"
  >
    {{ mode === "active" ? $t("app.tmuxNoActiveMonitors") : $t("app.tmuxNoHistory") }}
  </div>
</template>
