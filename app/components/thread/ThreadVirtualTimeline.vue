<script setup lang="ts">
import { Loader2Icon } from "@lucide/vue";
import { useVirtualizer, type VirtualItem } from "@tanstack/vue-virtual";
import { computed, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ThreadTurnView from "@/components/thread/ThreadTurnView.vue";
import { useVirtualStickToBottom } from "@/composables/useVirtualStickToBottom";
import { shouldAdjustVirtualScrollForResize } from "@/utils/virtual-scroll";

type TimelineRow =
  | { key: string; type: "older" }
  | { key: string; type: "turn"; turn: Record<string, any> }
  | { key: string; type: "error"; message: string };

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
const scrollAreaRef = ref<any>(null);
const rowElements = new Map<number, Element>();
const threshold = 120;

const sticky = useVirtualStickToBottom({
  threshold,
  getViewport: scrollViewport,
  measure: measureVisibleRows,
  scrollToBottom: () => {
    if (rows.value.length) {
      virtualizer.value.scrollToEnd({ behavior: "auto" });
    }
  },
});

const rows = computed<TimelineRow[]>(() => {
  const timelineRows: TimelineRow[] = [];
  if (props.threadId && props.olderTurnsCursor) {
    timelineRows.push({ key: "older-turns", type: "older" });
  }
  for (const turn of props.turns) {
    timelineRows.push({
      key: `turn-${turn.id || JSON.stringify(turn).length}`,
      type: "turn",
      turn,
    });
  }
  if (props.visibleError) {
    timelineRows.push({
      key: `error-${props.visibleError}`,
      type: "error",
      message: props.visibleError,
    });
  }
  return timelineRows;
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: scrollViewport,
    getItemKey: (index: number) => rows.value[index]?.key ?? index,
    estimateSize: (index: number) => estimatedRowSize(rows.value[index]),
    overscan: 6,
    scrollEndThreshold: threshold,
    initialOffset: 0,
    shouldAdjustScrollPositionOnItemSizeChange: (item, _delta, instance) =>
      shouldAdjustVirtualScrollForResize(sticky.followLatest.value, item, instance),
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

function scrollViewport() {
  const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value;
  return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
}

function estimatedRowSize(row: TimelineRow | undefined) {
  if (!row) {
    return 160;
  }
  if (row.type === "older") {
    return 56;
  }
  if (row.type === "error") {
    return 96;
  }
  return 520;
}

function resetFollowLatest() {
  sticky.reset();
}

function handleScroll(event: Event) {
  const viewport = event.target as HTMLElement;
  if (!sticky.handleScroll(event)) {
    return;
  }
  if (viewport.scrollTop <= 80 && props.olderTurnsCursor && !props.loadingOlder) {
    emit("loadOlder");
  }
}

function setRowRef(element: Element | null) {
  if (!element) {
    return;
  }
  const index = Number((element as HTMLElement).dataset.index);
  if (Number.isFinite(index)) {
    rowElements.set(index, element);
  }
  virtualizer.value.measureElement(element);
  observeRows();
}

function measureVisibleRows() {
  for (const virtualRow of virtualRows.value) {
    const element = rowElements.get(virtualRow.index);
    if (element?.isConnected) {
      virtualizer.value.measureElement(element);
    } else {
      rowElements.delete(virtualRow.index);
    }
  }
}

function rowStyle(virtualRow: VirtualItem) {
  return {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    transform: `translateY(${virtualRow.start}px)`,
  };
}

watch(
  () => props.threadId,
  () => {
    resetFollowLatest();
  },
  { flush: "post" },
);

watch(
  () => [rows.value.length, props.followKey] as const,
  async () => {
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

onMounted(() => {
  observeRows();
  resetFollowLatest();
});

function observeRows() {
  sticky.observeElements(rowElements.values());
}
</script>

<template>
  <ScrollArea
    ref="scrollAreaRef"
    data-testid="chat-scroll-area"
    class="h-full min-h-0 flex-1 overflow-hidden"
    @scroll.capture="handleScroll"
  >
    <div
      class="mx-auto min-h-[calc(100dvh-14rem)] w-full max-w-4xl px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:py-[clamp(2rem,6vh,3rem)]"
      :class="sticky.initialBottomAligned.value ? 'opacity-100' : 'opacity-0'"
    >
      <div class="relative" :style="{ height: `${totalSize}px` }">
        <div
          v-for="virtualRow in virtualRows"
          :key="virtualRow.key"
          :ref="setRowRef"
          :data-index="virtualRow.index"
          class="pb-5 md:pb-8"
          :style="rowStyle(virtualRow)"
        >
          <template v-if="rows[virtualRow.index]?.type === 'older'">
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
            v-else-if="rows[virtualRow.index]?.type === 'turn'"
            :turn="(rows[virtualRow.index] as any).turn"
            :host-id="hostId"
            :thread-id="threadId"
          />

          <div
            v-else-if="rows[virtualRow.index]?.type === 'error'"
            class="mx-auto max-w-3xl whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {{ (rows[virtualRow.index] as any).message }}
          </div>
        </div>
      </div>
    </div>
  </ScrollArea>
</template>
