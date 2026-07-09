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

const agentTab = computed(() => props.tabs.find((tab) => tab.kind === "agent") ?? null);
const secondaryTabs = computed(() => props.tabs.filter((tab) => tab.kind !== "agent"));
</script>

<template>
  <TabsList variant="line" class="min-w-0 max-w-full justify-start overflow-hidden">
    <TabsTrigger
      v-if="agentTab"
      data-testid="workspace-tab"
      :data-tab-kind="agentTab.kind"
      :data-tab-title="agentTab.title"
      :value="agentTab.id"
      class="group min-w-0 flex-none gap-1.5 rounded-lg px-2 data-active:bg-canvas-soft data-active:text-ink data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
      :class="compact ? 'max-w-[min(8rem,24vw)]' : 'max-w-[10rem]'"
    >
      <MonitorIcon class="size-3.5" />
      <span
        class="min-w-0 truncate"
        :class="compact ? 'max-w-[min(5rem,18vw)]' : 'max-w-[7rem]'"
        :title="agentTab.title"
      >
        {{ agentTab.title }}
      </span>
    </TabsTrigger>

    <div
      v-if="secondaryTabs.length"
      class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
    >
      <TabsTrigger
        v-for="tab in secondaryTabs"
        :key="tab.id"
        data-testid="workspace-tab"
        :data-tab-kind="tab.kind"
        :data-tab-title="tab.title"
        :value="tab.id"
        class="group min-w-0 flex-none gap-1.5 rounded-lg data-active:bg-canvas-soft data-active:text-ink data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
        :class="compact ? 'max-w-[min(10rem,34vw)] px-2' : 'max-w-[min(14rem,22vw)] px-2.5'"
      >
        <TerminalIcon v-if="tab.kind === 'terminal'" class="size-3.5" />
        <BotIcon v-else-if="tab.kind === 'subagent'" class="size-3.5" />
        <FileTextIcon v-else class="size-3.5" />
        <span
          class="min-w-0 truncate"
          :class="compact ? 'max-w-[min(7rem,26vw)]' : 'max-w-[min(11rem,18vw)]'"
          :title="tab.title"
        >
          {{ tab.title }}
        </span>
        <button
          type="button"
          class="ml-1 inline-flex size-4 items-center justify-center rounded-sm text-ink-muted opacity-70 hover:bg-surface hover:text-ink group-data-active:opacity-100"
          :aria-label="$t('app.closeTab')"
          @click.stop="emit('closeTab', tab)"
        >
          <XIcon class="size-3" />
        </button>
      </TabsTrigger>
    </div>
  </TabsList>
</template>
