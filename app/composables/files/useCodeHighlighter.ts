import { computed, type Ref } from "vue";

import { escapeHtml, highlightCode, normalizeLanguage } from "@/utils/code-highlight";
import { useStreamRenderScheduler } from "@/composables/rendering/useStreamRenderScheduler";

export function useCodeHighlighter(
  code: Ref<string>,
  language: Ref<string>,
  streaming?: Ref<boolean>,
) {
  const scheduler = useStreamRenderScheduler({
    source: () => [code.value || "", normalizeLanguage(language.value)] as const,
    renderImmediately: ([value]) => escapeHtml(value),
    shouldEnhance: ([, currentLanguage]) =>
      Boolean(currentLanguage && currentLanguage !== "text" && currentLanguage !== "plain"),
    async renderEnhanced([value, currentLanguage]) {
      try {
        return await highlightCode(value, currentLanguage);
      } catch {
        return escapeHtml(value);
      }
    },
    streaming,
  });

  return {
    html: computed(() => scheduler.output.value || ""),
    loading: scheduler.enhancing,
  };
}
