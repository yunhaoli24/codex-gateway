import { ref, watch, type ComputedRef } from "vue";
import { statusValue, itemStatusSignature } from "./thread-turn-sections";

export function useIntermediateStepsDisclosure(input: {
  turn: ComputedRef<Record<string, any>>;
  items: ComputedRef<any[]>;
  turnIsActive: ComputedRef<boolean>;
  threadIsRunning: ComputedRef<boolean>;
  autoCollapseIntermediate: ComputedRef<boolean>;
}) {
  const intermediateOpen = ref(false);
  const intermediateOpenTouchedByUser = ref(false);

  watch(
    () => [
      input.turn.value.id,
      input.threadIsRunning.value,
      statusValue(input.turn.value.status),
      input.autoCollapseIntermediate.value,
      ...itemStatusSignature(input.items.value),
    ],
    () => {
      if (input.threadIsRunning.value && input.turnIsActive.value) {
        intermediateOpenTouchedByUser.value = false;
        intermediateOpen.value = true;
        return;
      }
      if (input.autoCollapseIntermediate.value && !intermediateOpenTouchedByUser.value) {
        intermediateOpen.value = false;
      }
    },
    { immediate: true },
  );

  watch(
    () => input.turn.value.id,
    () => {
      intermediateOpenTouchedByUser.value = false;
    },
  );

  function setIntermediateOpen(open: boolean) {
    intermediateOpenTouchedByUser.value = true;
    intermediateOpen.value = open;
  }

  return {
    intermediateOpen,
    setIntermediateOpen,
  };
}
