<script setup lang="ts">
import { RefreshCwIcon } from "@lucide/vue";
import { useAsyncState } from "@vueuse/core";
import { computed, watch } from "vue";
import type { TmuxPaneSnapshot } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchTmuxPaneOutput } from "@/stores/gateway-tmux/transport";
import { gatewayErrorMessage } from "@/utils/gateway-error";

const props = defineProps<{
  open: boolean;
  hostId: number;
  hostTitle: string;
  pane: TmuxPaneSnapshot | null;
}>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const { t } = useI18n();

const request = useAsyncState(
  async () => {
    if (!props.pane) return null;
    return await fetchTmuxPaneOutput(props.hostId, props.pane);
  },
  null,
  { immediate: false, resetOnExecute: true },
);
const errorMessage = computed(() =>
  request.error.value
    ? gatewayErrorMessage(request.error.value, t("app.tmuxPaneOutputLoadFailed"))
    : "",
);

watch([() => props.open, () => props.hostId, () => props.pane?.paneId], ([open]) => {
  if (open && props.pane) void request.execute();
});
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="flex h-[min(44rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] !max-w-[min(64rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
    >
      <DialogHeader class="shrink-0 border-b border-hairline px-5 py-4 text-left">
        <div class="flex min-w-0 items-start gap-3 pr-8">
          <div class="min-w-0 flex-1">
            <DialogTitle class="truncate" :title="pane?.sessionName">
              {{ pane?.sessionName }} · {{ pane?.windowIndex }}.{{ pane?.paneIndex }}
            </DialogTitle>
            <DialogDescription class="mt-1 truncate">
              {{ hostTitle }} · {{ pane?.windowName || pane?.paneId }} · {{ pane?.currentCommand }}
            </DialogDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            class="shrink-0 gap-1.5"
            :disabled="request.isLoading.value"
            data-testid="refresh-tmux-pane-output"
            @click="request.execute()"
          >
            <RefreshCwIcon
              class="size-3.5"
              :class="request.isLoading.value ? 'animate-spin' : ''"
            />
            {{ $t("app.tmuxRefreshOutput") }}
          </Button>
        </div>
      </DialogHeader>

      <div class="min-h-0 flex-1 p-4">
        <div
          v-if="errorMessage"
          class="grid h-full place-items-center rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
        >
          {{ errorMessage }}
        </div>
        <div
          v-else-if="request.isLoading.value && !request.state.value"
          class="grid h-full place-items-center text-sm text-ink-muted"
        >
          {{ $t("app.tmuxLoadingPaneOutput") }}
        </div>
        <pre
          v-else
          data-testid="tmux-pane-output"
          class="h-full overflow-auto rounded-lg border border-hairline bg-canvas-soft p-4 font-mono text-xs leading-relaxed text-ink"
        ><code>{{ request.state.value?.output || $t("app.tmuxEmptyPaneOutput") }}</code></pre>
      </div>
    </DialogContent>
  </Dialog>
</template>
