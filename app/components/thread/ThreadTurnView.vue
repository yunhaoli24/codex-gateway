<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, ListTreeIcon } from "@lucide/vue";
import { computed, toRef } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";
import { provideFilePreviewContext } from "@/composables/files/useFilePreviewContext";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import {
  buildThreadTurnSections,
  itemKey,
  userMessageVariant as userMessageVariantForSection,
} from "./thread-turn-sections";
import { useIntermediateStepsDisclosure } from "./useIntermediateStepsDisclosure";

const props = withDefaults(
  defineProps<{
    turn: Record<string, any>;
    hostId: number | null;
    projectId?: number | null;
    threadId: string | null;
    threadRuntimeStatus: ThreadRuntimeStatus;
    autoCollapseIntermediate?: boolean;
  }>(),
  {
    autoCollapseIntermediate: true,
  },
);

const { t } = useI18n();
const composer = useGatewayComposerStore();
const projectId = computed(() => props.projectId ?? null);
provideFilePreviewContext({
  hostId: toRef(props, "hostId"),
  projectId,
  threadId: toRef(props, "threadId"),
});

const turn = computed(() => props.turn);
const planModeActive = computed(() => selectedThreadMode() === "plan");
const sections = computed(() =>
  buildThreadTurnSections(props.turn, { planModeActive: planModeActive.value }),
);
const items = computed(() => sections.value.items);
const userItems = computed(() => sections.value.userItems);
const intermediateItems = computed(() => sections.value.intermediateItems);
const finalItems = computed(() => sections.value.finalItems);
const turnIsActive = computed(() => sections.value.turnIsActive);
const threadIsRunning = computed(() => props.threadRuntimeStatus === "running");
const autoCollapseIntermediate = computed(() => props.autoCollapseIntermediate);
const { intermediateOpen, setIntermediateOpen } = useIntermediateStepsDisclosure({
  turn,
  items,
  turnIsActive,
  threadIsRunning,
  autoCollapseIntermediate,
});

function selectedThreadMode() {
  if (!props.hostId || !props.threadId) {
    return "default";
  }
  return composer.threadCollaborationModesByKey[`${props.hostId}:${props.threadId}`] ?? "default";
}

function userMessageVariant(item: any) {
  return userMessageVariantForSection(item, sections.value);
}
</script>

<template>
  <div class="space-y-6">
    <ThreadItemView
      v-for="(item, index) in userItems"
      :key="itemKey(item, 'user', index)"
      :item="item"
      :host-id="hostId"
      :thread-id="threadId"
      :user-message-variant="userMessageVariant(item)"
    />

    <Collapsible
      v-if="intermediateItems.length"
      :open="intermediateOpen"
      v-slot="{ open }"
      class="max-w-4xl rounded-lg border border-hairline bg-surface text-ink-secondary"
      @update:open="setIntermediateOpen"
    >
      <CollapsibleTrigger
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas-soft"
      >
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
        <ListTreeIcon class="size-4 shrink-0 text-ink-faint" />
        <span class="min-w-0 flex-1 truncate">{{ t("app.intermediateSteps") }}</span>
        <Badge variant="outline">{{ intermediateItems.length }}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div data-testid="intermediate-steps" class="space-y-5 border-t border-hairline px-3 py-4">
          <ThreadItemView
            v-for="(item, index) in intermediateItems"
            :key="itemKey(item, 'middle', index)"
            :item="item"
            :host-id="hostId"
            :thread-id="threadId"
            :user-message-variant="userMessageVariant(item)"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <ThreadItemView
      v-for="(item, index) in finalItems"
      :key="itemKey(item, 'final', index)"
      :item="item"
      :host-id="hostId"
      :thread-id="threadId"
      :user-message-variant="userMessageVariant(item)"
    />
  </div>
</template>
