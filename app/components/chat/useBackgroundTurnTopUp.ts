import { computed, watch, type Ref } from "vue";
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

export function useBackgroundTurnTopUp(input: BackgroundTurnTopUpInput) {
  const turnCount = computed(() => input.historyTurns.value.length);
  const topUpKey = computed(() =>
    input.selectedHostId.value && input.selectedThreadId.value
      ? `${input.selectedHostId.value}:${input.selectedThreadId.value}:${turnCount.value}:${input.olderTurnsCursor.value ?? ""}`
      : null,
  );

  watch(
    topUpKey,
    () => {
      if (!shouldTopUp(input)) {
        return;
      }
      input.loadOlderTurns({
        limit: Math.min(
          OLDER_TURN_PAGE_LIMIT,
          OPEN_THREAD_BACKGROUND_TURN_TARGET - turnCount.value,
        ),
      });
    },
    { flush: "post" },
  );
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
