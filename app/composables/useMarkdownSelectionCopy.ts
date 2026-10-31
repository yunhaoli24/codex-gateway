import { useEventListener } from "@vueuse/core";
import { onMounted, shallowRef, type Ref } from "vue";
import { loadMarkdownClipboard } from "@/utils/browser-runtime/markdown-clipboard";
import { selectedMarkdownFragment } from "@/utils/markdown-selection";

export function useMarkdownSelectionCopy(target: Readonly<Ref<HTMLElement | null>>) {
  const convert = shallowRef<((fragment: HTMLElement) => string) | null>(null);
  onMounted(async () => {
    convert.value = await loadMarkdownClipboard();
  });
  // Browsers may dispatch copy at the focused element/body even when the selection is in a
  // read-only message. Listen at document scope and restrict ownership by the selected range.
  useEventListener(
    () => target.value?.ownerDocument,
    "copy",
    (event) => {
      if (!(event instanceof ClipboardEvent)) return;
      const boundary = target.value;
      const selection = window.getSelection();
      if (
        !boundary ||
        !selection ||
        !convert.value ||
        !event.clipboardData ||
        event.defaultPrevented
      )
        return;
      const fragment = selectedMarkdownFragment(selection, boundary);
      if (!fragment) return;
      const markdown = convert.value(fragment);
      if (markdown.length === 0) return;
      event.clipboardData.setData("text/plain", markdown);
      event.clipboardData.setData("text/markdown", markdown);
      event.clipboardData.setData("text/html", fragment.innerHTML);
      event.preventDefault();
    },
  );
}
