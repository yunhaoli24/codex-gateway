import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

interface StickToBottomScrollOptions {
  threshold?: number;
  scrollRetries?: number[];
  onTopReached?: () => void;
}

export function useStickToBottomScroll(
  scrollAreaRef: Ref<any>,
  options: StickToBottomScrollOptions = {},
) {
  const contentRef = ref<HTMLElement | null>(null);
  const followLatest = ref(true);
  const threshold = options.threshold ?? 120;
  const scrollRetries = options.scrollRetries ?? [80, 250];
  let scrollRequestToken = 0;
  let contentResizeObserver: ResizeObserver | null = null;

  function scrollViewport() {
    const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value;
    return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
  }

  function isNearBottom(viewport = scrollViewport()) {
    if (!viewport) {
      return false;
    }
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold;
  }

  async function scrollToBottom() {
    await nextTick();
    const token = ++scrollRequestToken;
    const scroll = () => {
      if (!followLatest.value || token !== scrollRequestToken) return;
      const viewport = scrollViewport();
      if (!viewport) return;
      viewport.scrollTop = viewport.scrollHeight;
    };
    scroll();
    if (typeof requestAnimationFrame !== "function" || typeof window === "undefined") {
      return;
    }
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(() => {
        scroll();
        for (const retry of scrollRetries) {
          window.setTimeout(scroll, retry);
        }
      });
    });
  }

  function resetFollowLatest() {
    followLatest.value = true;
    void scrollToBottom();
  }

  function cancelPendingAutoScroll() {
    scrollRequestToken += 1;
  }

  function handleScroll(event: Event) {
    const viewport = event.target as HTMLElement;
    const currentViewport = scrollViewport();
    if (viewport !== currentViewport) {
      return;
    }
    followLatest.value = isNearBottom(viewport);
    if (!followLatest.value) {
      cancelPendingAutoScroll();
    }
    if (viewport.scrollTop <= 80) {
      options.onTopReached?.();
    }
  }

  onMounted(() => {
    if (!contentRef.value) {
      return;
    }
    contentResizeObserver = new ResizeObserver(() => {
      if (followLatest.value) {
        void scrollToBottom();
      }
    });
    contentResizeObserver.observe(contentRef.value);
  });

  onBeforeUnmount(() => {
    contentResizeObserver?.disconnect();
    contentResizeObserver = null;
  });

  return {
    contentRef,
    followLatest,
    scrollViewport,
    isNearBottom,
    scrollToBottom,
    resetFollowLatest,
    handleScroll,
  };
}
