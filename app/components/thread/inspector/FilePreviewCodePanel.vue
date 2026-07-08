<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { FilePreviewTab } from "~~/shared/types";
import {
  escapeHtml,
  highlightCode,
  languageFromPath,
  normalizeLanguage,
} from "@/utils/code-highlight";

const props = defineProps<{
  tab: FilePreviewTab;
}>();

const scroller = ref<HTMLElement | null>(null);
const rows = ref<Array<{ line: number; html: string }>>([]);
let renderVersion = 0;

watch(
  () => [props.tab.text, props.tab.path, props.tab.line] as const,
  async () => {
    const currentVersion = renderVersion + 1;
    renderVersion = currentVersion;
    const language = normalizeLanguage(languageFromPath(props.tab.path));
    const rendered = await Promise.all(
      splitLines(props.tab.text).map(async (line, index) => ({
        line: index + 1,
        html: await renderLine(line, language),
      })),
    );
    if (renderVersion !== currentVersion) {
      return;
    }
    rows.value = rendered;
    await nextTick();
    scrollToTargetLine();
  },
  { immediate: true },
);

async function renderLine(line: string, language: string) {
  try {
    return await highlightCode(line || " ", language);
  } catch {
    return escapeHtml(line || " ");
  }
}

function splitLines(value: string) {
  const lines = value.split("\n");
  return lines.length ? lines : [""];
}

function scrollToTargetLine() {
  const line = props.tab.line;
  if (!line || !scroller.value) {
    return;
  }
  scroller.value
    .querySelector(`[data-preview-line="${line}"]`)
    ?.scrollIntoView({ block: "center", inline: "nearest" });
}
</script>

<template>
  <div
    ref="scroller"
    class="h-full overflow-auto bg-canvas font-mono text-[0.8125rem] leading-6 text-ink"
  >
    <div class="min-w-max py-3">
      <div
        v-for="row in rows"
        :key="row.line"
        :data-preview-line="row.line"
        class="grid grid-cols-[theme(spacing.14)_minmax(0,1fr)] border-l-2 border-transparent px-3"
        :class="row.line === tab.line ? 'border-primary bg-primary/8' : 'hover:bg-canvas-soft'"
      >
        <span class="select-none pr-4 text-right text-ink-faint">{{ row.line }}</span>
        <span class="whitespace-pre" v-html="row.html" />
      </div>
    </div>
  </div>
</template>
