<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import ThreadTurnView from "@/components/thread/ThreadTurnView.vue";
import VirtualTimelineViewport from "@/components/thread/VirtualTimelineViewport.vue";
import {
  buildThreadTimelineRows,
  estimateThreadTimelineRow,
  type ThreadTimelineRow,
} from "@/components/thread/timeline-rows";

const props = defineProps<{
  threadId: string | null;
  turns: Record<string, any>[];
  hostId: number | null;
  loading: boolean;
  loadingOlder: boolean;
  olderTurnsCursor: string | null;
  visibleError: string | null;
  followKey: unknown;
}>();

const emit = defineEmits<{
  loadOlder: [];
}>();

const { t } = useI18n();
const viewportRef = ref<{ resetFollowLatest: () => void } | null>(null);

const rows = computed(() =>
  buildThreadTimelineRows({
    threadId: props.threadId,
    turns: props.turns,
    olderTurnsCursor: props.olderTurnsCursor,
    visibleError: props.visibleError,
  }),
);

function handleReachStart() {
  if (props.olderTurnsCursor && !props.loadingOlder) {
    emit("loadOlder");
  }
}

function estimateRowSize(row: unknown) {
  return estimateThreadTimelineRow(row as ThreadTimelineRow | undefined);
}

function isOlderRow(row: unknown) {
  return (row as ThreadTimelineRow | undefined)?.type === "older";
}

function isTurnRow(row: unknown) {
  return (row as ThreadTimelineRow | undefined)?.type === "turn";
}

function isErrorRow(row: unknown) {
  return (row as ThreadTimelineRow | undefined)?.type === "error";
}

function turnForRow(row: unknown) {
  return (row as Extract<ThreadTimelineRow, { type: "turn" }>).turn;
}

function messageForRow(row: unknown) {
  return (row as Extract<ThreadTimelineRow, { type: "error" }>).message;
}

watch(
  () => props.threadId,
  () => {
    viewportRef.value?.resetFollowLatest();
  },
  { flush: "post" },
);
</script>

<template>
  <VirtualTimelineViewport
    ref="viewportRef"
    :rows="rows"
    :follow-key="followKey"
    :estimate-size="estimateRowSize"
    @reach-start="handleReachStart"
  >
    <template #default="{ row }">
      <template v-if="isOlderRow(row)">
        <div class="flex justify-center">
          <Button
            data-testid="load-older-turns-button"
            variant="outline"
            size="sm"
            :disabled="loadingOlder"
            @click="emit('loadOlder')"
          >
            {{ loadingOlder ? t("app.loadingOlder") : t("app.loadOlder") }}
          </Button>
        </div>
      </template>

      <ThreadTurnView
        v-else-if="isTurnRow(row)"
        :turn="turnForRow(row)"
        :host-id="hostId"
        :thread-id="threadId"
      />

      <div
        v-else-if="isErrorRow(row)"
        class="mx-auto max-w-3xl whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ messageForRow(row) }}
      </div>
    </template>
  </VirtualTimelineViewport>
</template>
