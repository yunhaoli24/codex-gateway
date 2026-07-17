<script setup lang="ts">
import { ChevronDownIcon, InfinityIcon, LoaderCircleIcon } from "@lucide/vue";
import { ref } from "vue";
import type { TmuxMonitor, TmuxMonitorMode, TmuxPaneSnapshot } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TmuxPermanentMonitorDialog from "./TmuxPermanentMonitorDialog.vue";

const props = defineProps<{
  pane: TmuxPaneSnapshot;
  monitor: TmuxMonitor | null;
  pending: boolean;
}>();

const emit = defineEmits<{
  monitor: [mode: TmuxMonitorMode];
  preview: [];
  promote: [monitor: TmuxMonitor];
  cancel: [monitor: TmuxMonitor];
}>();

const permanentDialogOpen = ref(false);

function confirmPermanent() {
  permanentDialogOpen.value = false;
  if (props.monitor?.mode === "once") emit("promote", props.monitor);
  else emit("monitor", "permanent");
}
</script>

<template>
  <div v-if="monitor" class="flex shrink-0 items-center">
    <button
      type="button"
      class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="$t('app.tmuxViewPaneOutput', { session: pane.sessionName })"
      :data-testid="`view-monitored-tmux-pane-${pane.sessionName}-${pane.windowIndex}-${pane.paneIndex}`"
      @click="emit('preview')"
    >
      <Badge variant="secondary" class="cursor-pointer gap-1">
        <InfinityIcon v-if="monitor.mode === 'permanent'" class="size-3" />
        {{
          monitor.mode === "permanent"
            ? $t(monitor.runStartedAt ? "app.tmuxPermanentRunning" : "app.tmuxPermanentWaiting")
            : $t("app.tmuxActiveMonitors")
        }}
      </Badge>
    </button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          size="icon"
          variant="ghost"
          class="ml-0.5 size-7"
          :disabled="pending"
          :aria-label="$t('app.tmuxMonitorActions')"
        >
          <LoaderCircleIcon v-if="pending" class="size-3.5 animate-spin" />
          <ChevronDownIcon v-else class="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem v-if="monitor.mode === 'once'" @select="permanentDialogOpen = true">
          {{ $t("app.tmuxPromotePermanent") }}
        </DropdownMenuItem>
        <DropdownMenuItem v-else class="text-destructive" @select="emit('cancel', monitor)">
          {{ $t("app.tmuxCancelPermanentMonitor") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  <div v-else class="flex shrink-0 items-center">
    <Button
      size="sm"
      variant="outline"
      class="h-7 rounded-r-none"
      :disabled="!pane.running || pending"
      :data-testid="`monitor-tmux-pane-${pane.sessionName}-${pane.windowIndex}-${pane.paneIndex}`"
      @click="emit('monitor', 'once')"
    >
      <LoaderCircleIcon
        v-if="pending"
        data-testid="tmux-monitor-adding-spinner"
        class="mr-1 size-3.5 animate-spin"
      />
      {{ pane.running ? $t("app.tmuxAddMonitor") : $t("app.tmuxIdleShell") }}
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          size="icon"
          variant="outline"
          class="size-7 rounded-l-none border-l-0"
          :disabled="pending"
          :aria-label="$t('app.tmuxMonitorActions')"
        >
          <ChevronDownIcon class="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem @select="permanentDialogOpen = true">
          <InfinityIcon class="size-4" />
          {{ $t("app.tmuxAddPermanentMonitor") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  <TmuxPermanentMonitorDialog
    :open="permanentDialogOpen"
    :session-name="pane.sessionName"
    :pending="pending"
    :promote="monitor?.mode === 'once'"
    @cancel="permanentDialogOpen = false"
    @confirm="confirmPermanent"
  />
</template>
