<script setup lang="ts">
import { BotIcon, FileTextIcon, MonitorIcon, TerminalIcon, XIcon } from "@lucide/vue";
import { computed } from "vue";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkspaceTabState } from "@/stores/gateway/types";

const props = defineProps<{
  tabs: WorkspaceTabState[];
  compact?: boolean;
}>();

const emit = defineEmits<{
  closeTab: [tab: WorkspaceTabState];
}>();

const visibleTabs = computed(() => props.tabs);
const triggerClass = computed(() =>
  [
    "group h-8 min-w-0 flex-none gap-1.5 rounded-lg border-0 px-2 text-sm data-active:bg-canvas-soft data-active:text-ink",
    "data-active:shadow-sm",
    "group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0",
    props.compact ? "max-w-[min(10rem,34vw)]" : "max-w-[min(14rem,22vw)]",
  ].join(" "),
);
const labelClass = computed(() =>
  props.compact ? "max-w-[min(7rem,26vw)]" : "max-w-[min(11rem,18vw)]",
);

function iconName(kind: WorkspaceTabState["kind"]) {
  if (kind === "agent") return MonitorIcon;
  if (kind === "terminal") return TerminalIcon;
  if (kind === "subagent") return BotIcon;
  return FileTextIcon;
}
</script>

<template>
  <TabsList
    variant="line"
    class="min-w-0 h-full w-full max-w-full justify-start gap-1 overflow-x-auto overflow-y-hidden"
  >
    <TabsTrigger
      v-for="tab in visibleTabs"
      :key="tab.id"
      data-testid="workspace-tab"
      :data-tab-kind="tab.kind"
      :data-tab-title="tab.title"
      :value="tab.id"
      :class="triggerClass"
    >
      <component :is="iconName(tab.kind)" class="size-3.5" />
      <span class="min-w-0 truncate" :class="labelClass" :title="tab.title">
        {{ tab.title }}
      </span>
      <button
        v-if="tab.kind === 'terminal' || tab.kind === 'subagent'"
        type="button"
        class="ml-1 inline-flex size-4 items-center justify-center rounded-sm text-ink-muted opacity-70 hover:bg-surface hover:text-ink group-data-active:opacity-100"
        :aria-label="$t('app.closeTab')"
        @click.stop="emit('closeTab', tab)"
      >
        <XIcon class="size-3" />
      </button>
    </TabsTrigger>
  </TabsList>
</template>
