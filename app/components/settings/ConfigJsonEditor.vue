<script setup lang="ts">
import { computed, ref } from "vue";
import { Textarea } from "@/components/ui/textarea";

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string>({ default: "" });
const highlightRef = ref<HTMLElement | null>(null);

const highlightedJson = computed(() => {
  const value = model.value || "";
  if (!value) {
    return "";
  }
  return highlightJson(value);
});

function syncScroll(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  if (!highlightRef.value) {
    return;
  }
  highlightRef.value.scrollTop = target.scrollTop;
  highlightRef.value.scrollLeft = target.scrollLeft;
}

function highlightJson(value: string) {
  return escapeHtml(value).replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:))|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\b(true|false)\b|\b(null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    (match, key, string, booleanValue, nullValue, numberValue) => {
      if (key) {
        return `<span class="text-primary">${key}</span>`;
      }
      if (string) {
        return `<span class="text-accent-teal">${string}</span>`;
      }
      if (booleanValue) {
        return `<span class="text-accent-purple-deep">${booleanValue}</span>`;
      }
      if (nullValue) {
        return `<span class="text-accent-orange-deep">${nullValue}</span>`;
      }
      if (numberValue) {
        return `<span class="text-accent-orange">${numberValue}</span>`;
      }
      return match;
    },
  );
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
</script>

<template>
  <div class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-surface">
    <pre
      ref="highlightRef"
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-3 font-mono text-sm leading-6"
      v-html="highlightedJson"
    />
    <Textarea
      v-model="model"
      data-testid="config-json-textarea"
      :placeholder="placeholder"
      spellcheck="false"
      class="relative h-full min-h-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-sm leading-6 text-transparent caret-ink shadow-none [field-sizing:fixed] selection:bg-primary/20 placeholder:text-ink-faint focus-visible:ring-0"
      @scroll="syncScroll"
    />
  </div>
</template>
