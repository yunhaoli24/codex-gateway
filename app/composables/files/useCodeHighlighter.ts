import { computed, ref, watch, type Ref } from "vue";

import { escapeHtml, highlightCode, normalizeLanguage } from "@/utils/code-highlight";

export function useCodeHighlighter(code: Ref<string>, language: Ref<string>) {
  const html = ref("");
  const loading = ref(false);
  const renderVersion = ref(0);

  async function render() {
    const currentVersion = renderVersion.value + 1;
    renderVersion.value = currentVersion;
    const currentCode = code.value || "";
    const currentLanguage = normalizeLanguage(language.value);
    loading.value = true;
    try {
      const highlighted = await highlightCode(currentCode, currentLanguage);
      if (renderVersion.value === currentVersion) {
        html.value = highlighted;
      }
    } catch {
      if (renderVersion.value === currentVersion) {
        html.value = escapeHtml(currentCode);
      }
    } finally {
      if (renderVersion.value === currentVersion) {
        loading.value = false;
      }
    }
  }

  watch(
    () => [code.value, language.value] as const,
    () => {
      void render();
    },
    { immediate: true },
  );

  return {
    html: computed(() => html.value),
    loading: computed(() => loading.value),
  };
}
