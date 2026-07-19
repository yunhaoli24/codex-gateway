import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, ref, watch, type WatchSource } from "vue";

interface StreamRenderSchedulerOptions<TInput, TOutput> {
  source: WatchSource<TInput>;
  renderImmediately: (input: TInput) => TOutput;
  shouldEnhance: (input: TInput) => boolean;
  renderEnhanced: (input: TInput) => Promise<TOutput>;
  streaming?: WatchSource<boolean>;
  delay?: number;
  maxWait?: number;
}

/**
 * Keeps streaming UI responsive without starting a costly renderer for every delta.
 *
 * The immediate renderer must be cheap and safe to run for every update. The enhanced
 * renderer is debounced, and this composable deliberately permits only one of those jobs at a
 * time. A version check alone would hide stale results but would still let every Shiki job burn
 * CPU while an Agent is streaming.
 */
export function useStreamRenderScheduler<TInput, TOutput>(
  options: StreamRenderSchedulerOptions<TInput, TOutput>,
) {
  const output = ref<TOutput>();
  const enhancing = ref(false);
  let latestInput: TInput;
  let version = 0;
  let running = false;
  let rerunAfterCurrentJob = false;

  const runEnhanced = async () => {
    if (running) {
      rerunAfterCurrentJob = true;
      return;
    }
    if (!options.shouldEnhance(latestInput)) return;

    running = true;
    enhancing.value = true;
    const jobVersion = version;
    const jobInput = latestInput;
    try {
      const enhanced = await options.renderEnhanced(jobInput);
      if (version === jobVersion) output.value = enhanced;
    } finally {
      running = false;
      enhancing.value = false;
      if (rerunAfterCurrentJob) {
        rerunAfterCurrentJob = false;
        void scheduleEnhanced();
      }
    }
  };

  const scheduleEnhanced = useDebounceFn(runEnhanced, options.delay ?? 96, {
    maxWait: options.maxWait ?? 400,
  });

  watch(
    options.source,
    (input) => {
      latestInput = input;
      version += 1;
      output.value = options.renderImmediately(input);
      if (options.shouldEnhance(input)) {
        if (running) rerunAfterCurrentJob = true;
        else void scheduleEnhanced();
      }
    },
    { immediate: true },
  );

  if (options.streaming) {
    watch(
      options.streaming,
      (streaming, wasStreaming) => {
        if (streaming || !wasStreaming || !options.shouldEnhance(latestInput)) return;
        // A completed item no longer receives deltas, so do not wait for the debounce window
        // before showing its final Shiki result. nextTick lets the final content/source watcher
        // commit first while runEnhanced still keeps the single in-flight job invariant.
        void nextTick().then(runEnhanced);
      },
      { flush: "post" },
    );
  }

  return {
    output: computed(() => output.value),
    enhancing: computed(() => enhancing.value),
  };
}
