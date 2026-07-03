<script setup lang="ts">
import { CheckCircle2Icon, CircleIcon, ClockIcon, ListTodoIcon } from "@lucide/vue";
import { computed } from "vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import PlanImplementationActions from "./PlanImplementationActions.vue";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();
const { t } = useI18n();

const steps = computed(() => (Array.isArray(props.item.plan) ? props.item.plan : []));

function stepStatus(step: Record<string, any>) {
  return typeof step.status === "string" ? step.status : "pending";
}
</script>

<template>
  <div class="max-w-4xl rounded-lg border border-hairline bg-surface px-4 py-3 text-ink-secondary">
    <div class="mb-3 flex items-center gap-2 text-[0.9375rem] font-medium text-ink-secondary">
      <ListTodoIcon class="size-4" />
      <span>{{ t("app.todoPlan") }}</span>
    </div>
    <MarkdownContent v-if="item.explanation" :content="item.explanation" compact />
    <div v-if="steps.length" class="mt-3 space-y-2">
      <div
        v-for="(step, index) in steps"
        :key="`${index}-${step.step}`"
        class="flex items-start gap-2 text-sm leading-6"
      >
        <CheckCircle2Icon
          v-if="stepStatus(step) === 'completed'"
          class="mt-1 size-4 shrink-0 text-accent-green"
        />
        <ClockIcon
          v-else-if="stepStatus(step) === 'inProgress'"
          class="mt-1 size-4 shrink-0 text-primary"
        />
        <CircleIcon v-else class="mt-1 size-4 shrink-0 text-ink-faint" />
        <span class="min-w-0 flex-1">{{ step.step }}</span>
      </div>
    </div>
    <PlanImplementationActions :item="item" :host-id="hostId" :thread-id="threadId" />
  </div>
</template>
