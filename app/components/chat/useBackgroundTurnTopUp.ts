import { computed, nextTick, watch, type Ref } from "vue";
import { OLDER_TURN_PAGE_LIMIT, OPEN_THREAD_BACKGROUND_TURN_TARGET } from "~~/shared/config";

interface BackgroundTurnTopUpInput {
  selectedHostId: Ref<number | null>;
  selectedThreadId: Ref<string | null>;
  selectedThreadViewReady: Ref<boolean>;
  loading: Ref<boolean>;
  loadingOlderTurns: Ref<boolean>;
  olderTurnsCursor: Ref<string | null>;
  historyTurns: Ref<unknown[]>;
  loadOlderTurns: (options: { limit: number }) => void;
}

const INITIAL_LAYOUT_SETTLE_FRAMES = 4;

export function useBackgroundTurnTopUp(input: BackgroundTurnTopUpInput) {
  const turnCount = computed(() => input.historyTurns.value.length);
  const topUpKey = computed(() =>
    input.selectedHostId.value && input.selectedThreadId.value
      ? `${input.selectedHostId.value}:${input.selectedThreadId.value}:${turnCount.value}:${input.olderTurnsCursor.value ?? ""}`
      : null,
  );

  watch(
    topUpKey,
    async (_, __, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      if (!shouldTopUp(input)) {
        return;
      }
      const initialTurnCount = input.historyTurns.value.length;
      // Initial turns use dynamic virtual measurements. Let Vue commit and the
      // virtualizer finish its two-frame initial reflow before a fast cached
      // top-up prepends rows; otherwise first measurement and prepend anchoring
      // compete in the same painted frame and the short timeline visibly jumps.
      await nextTick();
      for (let frame = 0; frame < INITIAL_LAYOUT_SETTLE_FRAMES; frame += 1) {
        await nextFrame();
      }
      if (cancelled || !shouldTopUp(input)) return;
      const missingTurns = OPEN_THREAD_BACKGROUND_TURN_TARGET - initialTurnCount;
      if (missingTurns <= 0) return;
      input.loadOlderTurns({
        limit: Math.min(OLDER_TURN_PAGE_LIMIT, missingTurns),
      });
    },
    { flush: "post" },
  );
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function shouldTopUp(input: BackgroundTurnTopUpInput) {
  return (
    Boolean(input.selectedThreadId.value) &&
    input.selectedThreadViewReady.value &&
    !input.loading.value &&
    !input.loadingOlderTurns.value &&
    Boolean(input.olderTurnsCursor.value) &&
    input.historyTurns.value.length > 0 &&
    input.historyTurns.value.length < OPEN_THREAD_BACKGROUND_TURN_TARGET
  );
}
