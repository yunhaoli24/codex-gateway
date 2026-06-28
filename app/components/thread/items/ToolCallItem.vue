<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, ImageIcon, SearchIcon, WrenchIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { isItemInProgress, jsonPreview } from "@/utils/thread-items";

const props = defineProps<{
  item: Record<string, any>;
}>();
const { t } = useI18n();
const title = computed(() => {
  const item = props.item;
  if (item.type === "mcpToolCall") return `${item.server || "MCP"} · ${item.tool || "tool"}`;
  if (item.type === "dynamicToolCall") return item.name || item.tool || "Tool call";
  if (item.type === "webSearch") return item.query || "Web search";
  if (item.type === "imageGeneration") return item.revisedPrompt || t("app.imageGeneration");
  if (item.type === "enteredReviewMode") return t("app.enteredReviewMode");
  if (item.type === "exitedReviewMode") return t("app.exitedReviewMode");
  return item.type;
});
const iconType = computed(() => {
  if (props.item.type === "webSearch") return "search";
  if (props.item.type === "imageGeneration") return "image";
  return "tool";
});

const detailSections = computed(() => {
  const item = props.item;
  const sections: Array<{ label: string; content: string; markdown?: boolean }> = [];
  if (item.type === "mcpToolCall") {
    sections.push({ label: t("app.arguments"), content: jsonPreview(item.arguments) });
    if (item.result) sections.push({ label: t("app.result"), content: jsonPreview(item.result) });
    if (item.error?.message)
      sections.push({ label: t("app.error"), content: item.error.message, markdown: true });
  } else if (item.type === "dynamicToolCall") {
    sections.push({ label: t("app.arguments"), content: jsonPreview(item.arguments) });
    if (Array.isArray(item.contentItems) && item.contentItems.length) {
      sections.push({ label: t("app.result"), content: jsonPreview(item.contentItems) });
    }
  } else if (item.type === "webSearch" && item.action) {
    sections.push({ label: t("app.action"), content: jsonPreview(item.action) });
  } else if (item.type === "imageGeneration") {
    if (item.result)
      sections.push({ label: t("app.result"), content: item.result, markdown: true });
    if (item.savedPath)
      sections.push({ label: t("app.savedPath"), content: String(item.savedPath) });
  } else if (item.type === "enteredReviewMode" || item.type === "exitedReviewMode") {
    if (item.review)
      sections.push({ label: t("app.review"), content: item.review, markdown: true });
  }
  return sections.filter((section) => section.content);
});
</script>

<template>
  <div class="max-w-4xl text-[#8d9499]">
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
      v-if="detailSections.length"
      v-slot="{ open }"
      class="mt-2 rounded-lg border border-black/10 bg-[#fbfbfb]"
    >
      <CollapsibleTrigger
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
      >
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
        <span class="min-w-0 flex-1 truncate text-[#5f6970]">{{ t("app.toolDetails") }}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="space-y-3 border-t border-black/10 px-3 py-3">
          <div v-for="section in detailSections" :key="section.label" class="space-y-1">
            <div class="text-xs font-medium uppercase text-[#9aa1a6]">{{ section.label }}</div>
            <MarkdownContent v-if="section.markdown" :content="section.content" compact />
            <ScrollArea v-else class="h-56 rounded-md bg-white">
              <pre class="p-3 text-xs leading-5 text-[#3d4145]">{{ section.content }}</pre>
            </ScrollArea>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
