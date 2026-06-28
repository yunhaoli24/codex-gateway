import { ref } from "vue";

interface LongPressContextMenuOptions {
  delayMs?: number;
  moveTolerance?: number;
}

export function useLongPressContextMenu(options: LongPressContextMenuOptions = {}) {
  const delayMs = options.delayMs ?? 550;
  const moveTolerance = options.moveTolerance ?? 12;
  const longPressTriggered = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function resetLongPressFlag() {
    window.setTimeout(() => {
      longPressTriggered.value = false;
    }, 500);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" || event.button !== 0) {
      return;
    }
    clearTimer();
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    longPressTriggered.value = false;
    timer = setTimeout(() => {
      timer = null;
      longPressTriggered.value = true;
      event.preventDefault();
      const target = event.currentTarget as HTMLElement;
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        }),
      );
    }, delayMs);
  }

  function onPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId || !timer) {
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
