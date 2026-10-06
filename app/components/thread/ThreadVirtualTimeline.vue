<script setup lang="ts">
import { computed, onScopeDispose, ref, toRef, watch } from "vue";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import type { ThreadRuntimeStatus, ThreadTimelineTurn } from "~~/shared/types";
import { Button } from "@codex-gateway/ui/button";
import ThreadTimelineRowView from "@/components/thread/ThreadTimelineRowView.vue";
import VirtualTimelineViewport from "@/components/thread/VirtualTimelineViewport.vue";
import {
  buildThreadTimelineRows,
  estimateThreadTimelineRow,
  reuseUnchangedTimelineRows,
  type ThreadTimelineRow,
} from "@/components/thread/timeline-rows";
import { buildThreadTurnSections } from "@/components/thread/thread-turn-sections";
import { useIntermediateStepsDisclosure } from "@/components/thread/useIntermediateStepsDisclosure";
import { provideFilePreviewContext } from "@/composables/files/useFilePreviewContext";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { collaborationModeFromThreadSettings } from "@/utils/thread-collaboration-mode";

const props = defineProps<{
  threadId: string | null;
  threadStatus: ThreadRuntimeStatus;
  turns: ThreadTimelineTurn[];
  hostId: number | null;
  projectId?: number | null;
  workspaceRoot?: string | null;
  loading: boolean;
  loadingOlder: boolean;
  oldestTimelineCursor: string | null;
  scrollToLatestToken?: number;
}>();

const emit = defineEmits<{
  loadOlder: [];
}>();

const { t } = useI18n();
const composer = useGatewayComposerStore();
const threadTurns = useGatewayThreadTurnsStore();
const runtime = useGatewayThreadRuntimeStore();
const views = useGatewayThreadViewStore();

onScopeDispose(() => {
  if (props.hostId !== null && props.threadId !== null) {
    views.setExpandedTurn(props.hostId, props.threadId, null);
  }
});
const userDetachedFromLatest = ref(false);
const projectId = computed(() => props.projectId ?? null);
const planModeActive = computed(() => selectedThreadMode() === "plan");
const threadIsRunning = computed(() => props.threadStatus === "running");
const activeTurnId = computed(() =>
  props.hostId === null || props.threadId === null
    ? null
    : runtime.threadRuntimeProjection(props.hostId, props.threadId).activeTurnId,
);
const autoCollapseIntermediate = computed(() => !userDetachedFromLatest.value);

provideFilePreviewContext({
  hostId: toRef(props, "hostId"),
  projectId,
  threadId: toRef(props, "threadId"),
  workspaceRoot: computed(() => props.workspaceRoot ?? null),
});

const turnStates = computed(() =>
  props.turns.map((turn) => ({
    turn,
    sections: buildThreadTurnSections(turn, { planModeActive: planModeActive.value }),
  })),
);
const disclosureTurns = computed(() =>
  turnStates.value.map(({ turn }) => ({
    id: turn.id,
  })),
);
const { isIntermediateOpen, setIntermediateOpen } = useIntermediateStepsDisclosure({
  turns: disclosureTurns,
  threadIsRunning,
  activeTurnId,
  autoCollapseIntermediate,
});
function isTurnItemsLoading(turnId: string) {
  if (props.hostId === null || props.threadId === null) return false;
  const key = threadTurns.turnItemsKey(props.hostId, props.threadId, turnId);
  return threadTurns.loadingTurnItemsByKey[key] === true;
}
const rows = computed<ThreadTimelineRow[]>((previous) => {
  const timelineTurns = turnStates.value.map(({ turn, sections }) => ({
    turn,
    sections,
    intermediateOpen: isIntermediateOpen(turn.id),
    intermediateLoading: isTurnItemsLoading(turn.id),
  }));
  // The disclosure controller already owns the Agent-loop lifecycle: active work stays open and
  // the whole intermediate process collapses only after the thread settles. Footer actions must
  // consume that result instead of treating one turn/completed event as the end of a Goal or an
  // automatic continuation. Requiring every disclosure to be closed also keeps the actions hidden
  // while a reader has explicitly reopened historical intermediate work.
  const agentActionsAvailable =
    !threadIsRunning.value && timelineTurns.every((turn) => !turn.intermediateOpen);
  const next = buildThreadTimelineRows({
    threadId: props.threadId,
    turns: timelineTurns,
    agentActionsAvailable,
  });
  // A streaming delta invalidates the row list but normally changes only one item. Preserve all
  // other row identities so Vue and Markdown renderers do not repeat work inside the virtual
  // viewport; TanStack can then measure only the row whose content actually changed.
  return reuseUnchangedTimelineRows(previous, next);
});

function selectedThreadMode() {
  if (!props.hostId || !props.threadId) return "default";
  return collaborationModeFromThreadSettings(
    composer.threadSettingsByKey[`${props.hostId}:${props.threadId}`],
  );
}

watch(
  () => props.turns.find((turn) => isIntermediateOpen(turn.id))?.id ?? null,
  (turnId) => {
    if (props.hostId === null || props.threadId === null) return;
    // Reuse the accordion's one selection. Protect it before a requested page commits; a second
    // visibility tracker would add state even though collapsed rows already leave the virtual list.
    views.setExpandedTurn(props.hostId, props.threadId, turnId);
  },
  { flush: "sync", immediate: true },
);

function handleReachStart() {
  if (props.oldestTimelineCursor && !props.loadingOlder) emit("loadOlder");
}

function handleUserDetachedChange(detached: boolean) {
  userDetachedFromLatest.value = detached;
}

async function handleIntermediateToggle(turnId: string, open: boolean) {
  if (!open) {
    setIntermediateOpen(turnId, false);
    return;
  }
  const turn = props.turns.find((candidate) => candidate.id === turnId);
  setIntermediateOpen(turnId, true);
  if (
    turn?.itemsView !== "full" &&
    turn?.olderItemsCursor === undefined &&
    !(await threadTurns.loadTurnItems(turnId))
  )
    return;
}

function estimateRowSize(row: unknown) {
  return estimateThreadTimelineRow(row as ThreadTimelineRow | undefined);
}

function timelineRow(row: unknown) {
  return row as ThreadTimelineRow;
}

watch(
  () => props.threadId,
  () => {
    // Detachment belongs to the conversation being read, so it must not leak into the next
    // thread's disclosure policy. Scroll initialization is deliberately absent here: the keyed
    // viewport below owns its one official TanStack initial-layout transaction.
    userDetachedFromLatest.value = false;
  },
);
</script>

<template>
  <!--
    Key the viewport by thread so each conversation gets one clean TanStack Chat lifecycle.
    Do not also watch threadId and imperatively reset the child: after a keyed replacement the ref
    already points at the new viewport, so a parent reset would duplicate its initial layout scroll.
  -->
  <VirtualTimelineViewport
    :key="threadId ?? 'empty-thread'"
    :rows="rows"
    :estimate-size="estimateRowSize"
    :scroll-to-latest-token="scrollToLatestToken"
    @reach-start="handleReachStart"
    @user-detached-change="handleUserDetachedChange"
  >
    <template #overlay="{ visible }">
      <div
        v-if="oldestTimelineCursor && visible"
        class="pointer-events-auto flex justify-center pt-2"
      >
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
      <ThreadTimelineRowView
        :row="timelineRow(row)"
        :host-id="hostId"
        :thread-id="threadId"
        @intermediate-toggle="handleIntermediateToggle"
        @load-more="threadTurns.loadTurnItems($event)"
      />
    </template>
  </VirtualTimelineViewport>
</template>
