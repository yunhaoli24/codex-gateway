<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { computed, ref } from "vue";
import { PlanFooter } from "@codex-gateway/ai-elements/plan";
import { Button } from "@codex-gateway/ui/button";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import {
  buildThreadCollaborationMode,
  collaborationModeFromThreadSettings,
} from "@/utils/thread-collaboration-mode";
import { isThreadPlanItemCompleted } from "@/utils/thread-plan";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();

const store = useGatewayCatalogStore();
const composer = useGatewayComposerStore();
const navigation = useGatewayNavigationStore();
const threadTurns = useGatewayThreadTurnsStore();
const applying = ref(false);
const { t } = useI18n();

const planItemId = computed(() => (props.item.id ? String(props.item.id) : null));
const threadMode = computed(() => {
  if (!props.hostId || !props.threadId) {
    return "default";
  }
  return collaborationModeFromThreadSettings(
    composer.threadSettingsByKey[`${props.hostId}:${props.threadId}`],
  );
});
const dismissed = computed(() => {
  if (!props.hostId || !props.threadId || !planItemId.value) {
    return true;
  }
  return Boolean(
    composer.dismissedPlanPromptIdsByKey[`${props.hostId}:${props.threadId}`]?.[planItemId.value],
  );
});
const itemCompleted = computed(() => isThreadPlanItemCompleted(props.item));
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
    const collaborationMode = defaultCollaborationMode();
    if (collaborationMode === null) return;
    const updated = await composer.saveThreadSettings(
      props.hostId,
      props.threadId,
      navigation.selectedCwd,
      { collaborationMode },
    );
    if (!updated) return;
    await threadTurns.sendTurn(t("app.implementPlanMessage"), {
      collaborationMode,
    });
  } finally {
    applying.value = false;
  }
}

function continuePlanning() {
  if (!props.hostId || !props.threadId || !planItemId.value) {
    return;
  }
  composer.dismissPlanImplementationPrompt(props.hostId, props.threadId, planItemId.value);
}

function defaultCollaborationMode() {
  return buildThreadCollaborationMode({
    mode: "default",
    modelCandidates: [
      composer.selectedThreadSettings.collaborationMode?.settings.model,
      composer.selectedThreadSettings.model,
      store.defaultModel?.model,
      store.defaultModel?.id,
    ],
    effort: composer.selectedThreadSettings.effort,
  });
}
</script>

<template>
  <PlanFooter
    v-if="visible"
    class="flex flex-wrap items-center gap-2 border-t border-hairline bg-canvas-soft px-4 py-3"
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
  </PlanFooter>
</template>
