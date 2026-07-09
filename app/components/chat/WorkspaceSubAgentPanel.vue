<script setup lang="ts">
import type { ThreadRuntimeStatus } from "~~/shared/types";
import SubAgentPanelBody from "@/components/thread/subagent/SubAgentPanelBody.vue";
import type { ThreadTimelineTurn } from "@/components/thread/timeline-rows";
import type { SubAgentPanelState, ThreadViewState } from "@/stores/gateway/types";

defineProps<{
  title: string;
  panel: SubAgentPanelState;
  preview: ThreadViewState | null;
  turns: ThreadTimelineTurn[];
  followKey: unknown;
  status: ThreadRuntimeStatus;
}>();

const emit = defineEmits<{
  interrupt: [panel: SubAgentPanelState];
}>();
</script>

<template>
  <div data-testid="workspace-subagent-panel" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="flex min-h-12 shrink-0 items-center gap-2 border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)]"
    >
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold" data-testid="workspace-panel-title">
          {{ title }}
        </div>
        <div class="truncate font-mono text-xs text-ink-faint">
          {{ panel.threadId }}
        </div>
      </div>
      <button
        v-if="status === 'running'"
        type="button"
        class="rounded-full border border-destructive/30 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
        :aria-label="$t('app.interruptSubAgent')"
        @click="emit('interrupt', panel)"
      >
        {{ $t("app.interruptSubAgent") }}
      </button>
    </div>
    <SubAgentPanelBody :panel="panel" :preview="preview" :turns="turns" :follow-key="followKey" />
  </div>
</template>
