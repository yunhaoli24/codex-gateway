import { useTimeoutFn } from "@vueuse/core";
import { ref } from "vue";

interface LongPressContextMenuOptions {
  delayMs?: number;
  moveTolerance?: number;
}

export function useLongPressContextMenu(options: LongPressContextMenuOptions = {}) {
  const delayMs = options.delayMs ?? 550;
  const moveTolerance = options.moveTolerance ?? 12;
  const longPressTriggered = ref(false);
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let contextMenuTarget: HTMLElement | null = null;
  let contextMenuX = 0;
  let contextMenuY = 0;
  const longPressTimer = useTimeoutFn(fireLongPress, delayMs, { immediate: false });
  const resetFlagTimer = useTimeoutFn(
    () => {
      longPressTriggered.value = false;
    },
    500,
    { immediate: false },
  );

  function clearTimer() {
    longPressTimer.stop();
  }

  function resetLongPressFlag() {
    resetFlagTimer.stop();
    resetFlagTimer.start();
  }

  function fireLongPress() {
    longPressTriggered.value = true;
    contextMenuTarget?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: contextMenuX,
        clientY: contextMenuY,
      }),
    );
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" || event.button !== 0) {
      return;
    }
    clearTimer();
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    contextMenuTarget = event.currentTarget as HTMLElement;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    longPressTriggered.value = false;
    longPressTimer.start();
  }

  function onPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId || !longPressTimer.isPending.value) {
      return;
    }
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (distance > moveTolerance) {
      clearTimer();
    }
  }

  function onPointerEnd(event: PointerEvent) {
    if (pointerId !== event.pointerId) {
      return;
    }
    clearTimer();
    pointerId = null;
    contextMenuTarget = null;
    if (longPressTriggered.value) {
      event.preventDefault();
      resetLongPressFlag();
    }
  }

  function onClick(event: MouseEvent) {
    if (!longPressTriggered.value) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resetLongPressFlag();
  }

  return {
    longPressTriggered,
    longPressContextMenuHandlers: {
      onPointerdown: onPointerDown,
      onPointermove: onPointerMove,
      onPointerup: onPointerEnd,
      onPointercancel: onPointerEnd,
      onClick,
    },
  };
}
