<script setup lang="ts">
import { BotIcon, Loader2Icon, PanelRightCloseIcon, XIcon } from "@lucide/vue";
import type { SubAgentPanelState } from "@/stores/gateway/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

defineProps<{
  panels: SubAgentPanelState[];
  currentPanel: SubAgentPanelState;
  title: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  activate: [value: string | number];
  close: [panel: SubAgentPanelState];
  closeCurrent: [];
}>();

const { t } = useI18n();

function keyForPanel(panel: Pick<SubAgentPanelState, "hostId" | "threadId">) {
  return pinnedKey(panel.hostId, panel.threadId);
}

function titleForPanel(panel: Pick<SubAgentPanelState, "title" | "threadId">) {
  return panel.title || panel.threadId;
}
</script>

<template>
  <header class="shrink-0 border-b border-hairline">
    <div class="flex min-h-12 items-center gap-2 px-3">
      <BotIcon class="size-4 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold" data-testid="subagent-panel-title">
          {{ title }}
        </div>
        <div class="truncate font-mono text-xs text-ink-faint">
          {{ currentPanel.threadId }}
        </div>
      </div>
      <Badge v-if="loading" variant="outline" class="gap-1">
        <Loader2Icon class="size-3 animate-spin" />
        {{ t("app.loadingSubAgent") }}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('app.closeSubAgentPanel')"
        @click="emit('closeCurrent')"
      >
        <PanelRightCloseIcon class="hidden size-4 md:block" />
        <XIcon class="size-4 md:hidden" />
      </Button>
    </div>
    <TabsList
      variant="line"
      class="flex h-auto justify-start gap-1 overflow-x-auto rounded-none bg-transparent px-2 pb-1 pt-0"
    >
      <div
        v-for="panel in panels"
        :key="keyForPanel(panel)"
        class="flex max-w-[12rem] shrink-0 items-center rounded-lg border border-transparent bg-canvas-soft/70"
      >
        <TabsTrigger
          :value="keyForPanel(panel)"
          class="min-w-0 flex-1 justify-start px-2 py-1"
          data-testid="subagent-tab"
          @click="emit('activate', keyForPanel(panel))"
        >
          <span class="truncate">{{ titleForPanel(panel) }}</span>
        </TabsTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="mr-1"
          :aria-label="t('app.closeSubAgentTab', { title: titleForPanel(panel) })"
          @click.stop="emit('close', panel)"
        >
          <XIcon class="size-3" />
        </Button>
      </div>
    </TabsList>
  </header>
</template>
