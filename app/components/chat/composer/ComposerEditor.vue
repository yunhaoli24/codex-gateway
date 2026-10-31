<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { ComposerFileReference } from "@/stores/gateway/types";
import type { MarkdownComposer } from "./editor/create-markdown-composer";
import { useFileMentions } from "./editor/useFileMentions";
import ComposerFileMentionMenu from "./ComposerFileMentionMenu.vue";

const props = defineProps<{
  modelValue: string;
  references: ComposerFileReference[];
  scopeKey: string;
  hostId: number | null;
  cwd: string | null;
  disabled: boolean;
  placeholder: string;
  limitMessage: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string, scopeKey: string];
  "update:references": [value: ComposerFileReference[], scopeKey: string];
  keydown: [event: KeyboardEvent];
  paste: [event: ClipboardEvent];
  limit: [message: string];
}>();
const container = ref<HTMLElement | null>(null);
const editor = shallowRef<MarkdownComposer | null>(null);
const mentions = useFileMentions(
  props,
  editor,
  (value) => emit("update:references", value, props.scopeKey),
  () => emit("limit", props.limitMessage),
);
const { open, files, query, selectedIndex, loading, error } = mentions;
let disposed = false;

onMounted(async () => {
  // The active composer owns the editable document. Timeline and file previews keep using
  // MarkdownContent, so neither virtual rows nor file tabs create a rich-text editor.
  const { createMarkdownComposer } = await import("./editor/create-markdown-composer");
  if (disposed || !container.value) return;
  const instance = await createMarkdownComposer({
    root: container.value,
    value: () => props.modelValue,
    disabled: () => props.disabled,
    placeholder: () => props.placeholder,
    references: () => props.references,
    onUpdate: (text, view) => {
      emit("update:modelValue", text, props.scopeKey);
      const retained = props.references.filter((reference) => text.includes(`@${reference.path}`));
      if (retained.length !== props.references.length)
        emit("update:references", retained, props.scopeKey);
      mentions.update(view);
    },
    onSelection: mentions.update,
    onKeydown: (event, view) => {
      if (mentions.keydown(event)) return true;
      // Enter must retain normal list/code/quote editing. A plain paragraph keeps
      // Gateway's Enter-to-send and Shift+Enter-to-wrap behavior, including IME handling.
      const { $from } = view.state.selection;
      if (event.key === "Enter") {
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if (
            ["heading", "code_block", "list_item", "blockquote", "math_block"].includes(
              $from.node(depth).type.name,
            )
          )
            return false;
        }
      }
      emit("keydown", event);
      return event.defaultPrevented;
    },
    onPaste: (event) => {
      emit("paste", event);
      return event.defaultPrevented;
    },
  });
  if (disposed) {
    await instance.destroy();
    return;
  }
  editor.value = instance;
  instance.setMarkdown(props.modelValue);
  instance.refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  void editor.value?.destroy();
  editor.value = null;
});
watch(
  () => props.modelValue,
  (value) => editor.value?.setMarkdown(value),
);
watch(
  () => [props.disabled, props.placeholder, props.references],
  () => editor.value?.refresh(),
  { deep: true },
);
</script>

<template>
  <ComposerFileMentionMenu
    :open="open"
    :files="files"
    :selected-index="selectedIndex"
    :loading="loading"
    :query="query"
    :error="error"
    @hover="selectedIndex = $event"
    @select="mentions.select"
  />
  <div ref="container" data-testid="composer-editor" class="composer-editor markdown-content" />
</template>

<style>
.composer-editor {
  /* Reserve the same geometry before the lazy editor mounts. Otherwise its first paint shrinks
     the timeline after TanStack has already positioned the latest message at the bottom. */
  --composer-editor-min-height: 3.25rem;
  min-height: var(--composer-editor-min-height);
}
.composer-editor .ProseMirror {
  position: relative;
  max-height: min(28dvh, 10rem);
  min-height: var(--composer-editor-min-height);
  overflow-y: auto;
  overflow-wrap: anywhere;
  padding: 0.5rem 0.25rem;
  outline: none;
  font-size: 1rem;
  line-height: 1.5rem;
  caret-color: var(--ink);
}
.composer-editor .ProseMirror[data-empty="true"]::before {
  position: absolute;
  color: var(--muted-foreground);
  content: attr(placeholder);
  pointer-events: none;
}
.composer-editor .ProseMirror > :first-child {
  margin-top: 0;
}
.composer-editor .ProseMirror > :last-child {
  margin-bottom: 0;
}
.composer-editor [data-math] {
  font-family: ui-monospace, monospace;
}
.composer-editor [data-math="inline"]::before,
.composer-editor [data-math="inline"]::after {
  content: "$";
  color: var(--muted-foreground);
}
.composer-editor [data-math="block"]::before,
.composer-editor [data-math="block"]::after {
  content: "$$";
  display: block;
  color: var(--muted-foreground);
}
.composer-editor .composer-file-reference {
  display: inline-flex;
  max-width: min(100%, 28rem);
  align-items: center;
  overflow: hidden;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--primary) 13%, transparent);
  padding: 0.0625rem 0.25rem 0.0625rem 0.375rem;
  color: var(--primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
  vertical-align: baseline;
  white-space: nowrap;
}
@media (min-width: 48rem) {
  .composer-editor {
    --composer-editor-min-height: clamp(3.75rem, 10vh, 6rem);
  }
  .composer-editor .ProseMirror {
    max-height: min(24vh, 12rem);
    line-height: 1.75rem;
  }
}
</style>
