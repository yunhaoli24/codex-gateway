<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { ChevronDownIcon, ChevronRightIcon, ImageIcon, SearchIcon, WrenchIcon } from "@lucide/vue";
import { computed } from "vue";
import { Source, Sources } from "@codex-gateway/ai-elements/sources";
import { Badge } from "@codex-gateway/ui/badge";
import { Collapsible, CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import { ScrollArea } from "@codex-gateway/ui/scroll-area";
import DeferredCollapsibleContent from "@/components/common/DeferredCollapsibleContent.vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import StaticJsonCodeBlock from "@/components/common/StaticJsonCodeBlock.vue";
import { isItemInProgress } from "@/utils/thread-items";
import { presentToolCall } from "./tool-call-presenters";
import { useDeferredItemOutput } from "@/composables/thread/useDeferredItemOutput";
import { Loader } from "@codex-gateway/ai-elements/loader";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId?: number | null;
  threadId?: string | null;
}>();
const { t } = useI18n();
const { loadingDeferredOutput, onOutputOpen } = useDeferredItemOutput(props);
const presentation = computed(() => presentToolCall(props.item, t));
const title = computed(() => presentation.value.title);
const iconType = computed(() => presentation.value.icon);
const detailSections = computed(() => presentation.value.details);
</script>

<template>
  <div class="max-w-4xl text-ink-muted">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <SearchIcon v-if="iconType === 'search'" class="size-4" />
      <ImageIcon v-else-if="iconType === 'image'" class="size-4" />
      <WrenchIcon v-else class="size-4" />
      <span class="truncate">{{ title }}</span>
      <Badge v-if="item.status" variant="secondary">{{ item.status }}</Badge>
      <Badge v-if="isItemInProgress(item)" variant="outline">{{ t("app.running") }}</Badge>
      <Badge v-if="item.success === true" variant="outline">{{ t("app.completed") }}</Badge>
      <Badge v-else-if="item.success === false" variant="destructive">{{ t("app.failed") }}</Badge>
    </div>
    <Collapsible
      v-if="detailSections.length || item.outputDeferred === true"
      v-slot="{ open }"
      class="mt-2 rounded-lg border border-hairline bg-surface"
      @update:open="onOutputOpen"
    >
      <CollapsibleTrigger
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas-soft"
      >
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
        <span class="min-w-0 flex-1 truncate text-ink-secondary">{{ t("app.toolDetails") }}</span>
      </CollapsibleTrigger>
      <DeferredCollapsibleContent :open="open">
        <Loader v-if="loadingDeferredOutput" class="m-3 size-4 text-primary" />
        <div class="space-y-3 border-t border-hairline px-3 py-3">
          <div v-for="section in detailSections" :key="section.label" class="space-y-1">
            <div class="text-xs font-medium uppercase text-ink-faint">{{ section.label }}</div>
            <MarkdownContent
              v-if="section.kind === 'markdown'"
              :content="section.content"
              compact
            />
            <Sources v-else-if="section.kind === 'links'" class="mb-0 w-full space-y-2 text-sm">
              <Source
                v-for="link in section.links"
                :key="link.url"
                :href="link.url"
                :title="link.title"
                class="min-w-0 items-start rounded-md px-2 py-1.5 text-ink hover:bg-canvas-soft"
              >
                <SearchIcon class="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate font-medium underline decoration-hairline underline-offset-4"
                  >
                    {{ link.title }}
                  </span>
                  <span v-if="link.snippet" class="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {{ link.snippet }}
                  </span>
                </span>
              </Source>
            </Sources>
            <StaticJsonCodeBlock
              v-else-if="section.kind === 'json'"
              :value="section.value"
              max-height="default"
            />
            <ScrollArea v-else class="h-56 rounded-md bg-canvas-soft">
              <pre class="p-3 text-xs leading-5 text-ink-secondary">{{ section.content }}</pre>
            </ScrollArea>
          </div>
        </div>
      </DeferredCollapsibleContent>
    </Collapsible>
  </div>
</template>
