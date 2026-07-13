<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import ThreadTurnView from "@/components/thread/ThreadTurnView.vue";
import VirtualTimelineViewport from "@/components/thread/VirtualTimelineViewport.vue";
import {
  buildThreadTimelineRows,
  estimateThreadTimelineRow,
  type ThreadTimelineTurn,
  type ThreadTimelineRow,
} from "@/components/thread/timeline-rows";

const props = defineProps<{
  threadId: string | null;
  threadStatus: ThreadRuntimeStatus;
  turns: ThreadTimelineTurn[];
  hostId: number | null;
  projectId?: number | null;
  loading: boolean;
  loadingOlder: boolean;
  olderTurnsCursor: string | null;
  followKey: unknown;
}>();

const emit = defineEmits<{
  loadOlder: [];
}>();

const { t } = useI18n();
const viewportRef = ref<{ resetFollowLatest: () => void } | null>(null);
const userDetachedFromLatest = ref(false);

const rows = computed(() =>
  buildThreadTimelineRows({
    threadId: props.threadId,
    turns: props.turns,
  }),
);

function handleReachStart() {
  if (props.olderTurnsCursor && !props.loadingOlder) {
    emit("loadOlder");
  }
}

function handleUserDetachedChange(detached: boolean) {
  userDetachedFromLatest.value = detached;
}

function estimateRowSize(row: unknown) {
  return estimateThreadTimelineRow(row as ThreadTimelineRow | undefined);
}

function isTurnRow(row: unknown) {
  return (row as ThreadTimelineRow | undefined)?.type === "turn";
}

function turnForRow(row: unknown) {
  return (row as Extract<ThreadTimelineRow, { type: "turn" }>).turn;
}

watch(
  () => props.threadId,
  () => {
    userDetachedFromLatest.value = false;
    viewportRef.value?.resetFollowLatest();
  },
  { flush: "post" },
);
</script>

<template>
  <VirtualTimelineViewport
    ref="viewportRef"
    :key="threadId ?? 'empty-thread'"
    :rows="rows"
    :follow-key="followKey"
    :estimate-size="estimateRowSize"
    @reach-start="handleReachStart"
    @user-detached-change="handleUserDetachedChange"
  >
    <template #overlay>
      <div v-if="olderTurnsCursor" class="pointer-events-auto flex justify-center pt-2">
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

    <template #default="{ row }">
      <ThreadTurnView
        v-if="isTurnRow(row)"
        :turn="turnForRow(row)"
        :host-id="hostId"
        :project-id="projectId ?? null"
        :thread-id="threadId"
        :thread-runtime-status="threadStatus"
        :auto-collapse-intermediate="!userDetachedFromLatest"
      />
    </template>
  </VirtualTimelineViewport>
</template>
