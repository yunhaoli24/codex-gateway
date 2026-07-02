<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();

const store = useGatewayStore();
const applying = ref(false);

const planItemId = computed(() => (props.item.id ? String(props.item.id) : null));
const threadMode = computed(() => {
  if (!props.hostId || !props.threadId) {
    return "default";
  }
  return store.threadCollaborationModesByKey[`${props.hostId}:${props.threadId}`] ?? "default";
});
const dismissed = computed(() => {
  if (!props.hostId || !props.threadId || !planItemId.value) {
    return true;
  }
  return Boolean(
    store.dismissedPlanPromptIdsByKey[`${props.hostId}:${props.threadId}`]?.[planItemId.value],
  );
});
const itemCompleted = computed(() => props.item.status === "completed");
const visible = computed(() =>
  Boolean(
    props.hostId &&
    props.threadId &&
    planItemId.value &&
    itemCompleted.value &&
    threadMode.value === "plan" &&
    !dismissed.value,
  ),
);

async function implementPlan() {
  if (!props.hostId || !props.threadId || applying.value) {
    return;
  }
  applying.value = true;
  try {
    store.setThreadCollaborationMode(props.hostId, props.threadId, "default");
    await store.sendTurn("Implement the plan.", { collaborationMode: defaultCollaborationMode() });
  } finally {
    applying.value = false;
  }
}

function continuePlanning() {
  if (!props.hostId || !props.threadId || !planItemId.value) {
    return;
  }
  store.dismissPlanImplementationPrompt(props.hostId, props.threadId, planItemId.value);
}

function defaultCollaborationMode() {
  const model =
    store.selectedThreadSettings.model || store.defaultModel?.model || store.defaultModel?.id;
  if (!model) {
    return undefined;
  }
  return {
    mode: "default" as const,
    settings: {
      model,
      reasoningEffort: store.selectedThreadSettings.effort ?? null,
      developerInstructions: null,
    },
  };
}
</script>

<template>
  <div
    v-if="visible"
    class="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-canvas-soft px-3 py-2"
  >
    <span class="min-w-0 flex-1 text-sm text-ink-secondary">
      {{ $t("app.planImplementationPrompt") }}
    </span>
    <Button size="sm" :disabled="applying" @click="implementPlan">
      {{ $t("app.implementPlan") }}
    </Button>
    <Button size="sm" variant="ghost" @click="continuePlanning">
      {{ $t("app.continuePlanning") }}
    </Button>
  </div>
</template>
