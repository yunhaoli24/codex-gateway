<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { EyeIcon, FileCodeIcon, Loader2Icon, SaveIcon } from "@lucide/vue";
import type { FilePreviewDocument } from "~~/shared/types";
import { isMarkdownPreviewPath } from "~~/shared/file-preview";
import CodeEditor from "@/components/common/CodeEditor.vue";
import { Button } from "@/components/ui/button";
import { useGatewayFileWorkspaceStore } from "@/stores/gateway-file-workspace";
import { codeEditorLanguageForPath } from "@/utils/code-editor-extensions";
import { fileEditorExtensions } from "@/utils/file-editor-extensions";
import FileMarkdownPreview from "./FileMarkdownPreview.vue";

const MAX_EDITABLE_FILE_BYTES = 5 * 1024 * 1024;
type MarkdownMode = "source" | "preview";

const props = defineProps<{ document: FilePreviewDocument }>();
const emit = defineEmits<{ conflict: [] }>();
const fileWorkspace = useGatewayFileWorkspaceStore();
const editable = computed(() => (props.document.size ?? 0) <= MAX_EDITABLE_FILE_BYTES);
const markdown = computed(() =>
  isMarkdownPreviewPath(props.document.path, props.document.contentType),
);
const markdownMode = ref<MarkdownMode>(defaultMode(props.document));
const language = computed(() => codeEditorLanguageForPath(props.document.path));
const draft = computed({
  get: () => props.document.draftText,
  set: (value) => fileWorkspace.updateDocumentDraft(props.document, value),
});

// Dockview keeps this editor mounted while file tabs change. Reset only when the
// displayed document changes so Markdown opens rendered, while a user's explicit
// source/preview choice remains stable for the current document.
watch([() => props.document.path, () => props.document.contentType], () => {
  markdownMode.value = defaultMode(props.document);
});

function defaultMode(document: FilePreviewDocument): MarkdownMode {
  return isMarkdownPreviewPath(document.path, document.contentType) ? "preview" : "source";
}

function save() {
  if (editable.value) void fileWorkspace.saveDocument(props.document);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
    <div
      class="flex min-h-10 shrink-0 items-center gap-2 border-b border-hairline bg-canvas-soft/60 px-3"
    >
      <div
        v-if="markdown"
        class="flex items-center rounded-md border border-hairline bg-surface p-0.5"
      >
        <Button
          size="sm"
          :variant="markdownMode === 'source' ? 'secondary' : 'ghost'"
          class="h-7 gap-1.5 px-2"
          @click="markdownMode = 'source'"
        >
          <FileCodeIcon class="size-3.5" />
          {{ $t("app.fileSource") }}
        </Button>
        <Button
          size="sm"
          :variant="markdownMode === 'preview' ? 'secondary' : 'ghost'"
          class="h-7 gap-1.5 px-2"
          @click="markdownMode = 'preview'"
        >
          <EyeIcon class="size-3.5" />
          {{ $t("app.fileRenderedPreview") }}
        </Button>
      </div>
      <div class="ml-auto flex min-w-0 items-center gap-2 text-xs text-ink-muted">
        <span v-if="!editable" class="truncate text-accent-orange-deep">
          {{ $t("app.fileTooLargeToEdit") }}
        </span>
        <span v-else-if="document.saving" class="flex items-center gap-1.5">
          <Loader2Icon class="size-3.5 animate-spin" />{{ $t("app.savingFile") }}
        </span>
        <span
          v-else-if="document.saveError"
          class="max-w-64 truncate text-destructive"
          :title="document.saveError"
        >
          {{ document.saveError }}
        </span>
        <button
          v-else-if="document.conflict"
          type="button"
          class="text-destructive underline underline-offset-2"
          @click="emit('conflict')"
        >
          {{ $t("app.fileConflict") }}
        </button>
        <span v-else-if="document.dirty">{{ $t("app.fileUnsaved") }}</span>
        <span v-else>{{ $t("app.fileSaved") }}</span>
        <Button
          v-if="editable"
          variant="ghost"
          size="icon"
          class="size-7"
          :disabled="document.saving || !document.dirty"
          :title="$t('app.saveFile')"
          @click="save"
        >
          <SaveIcon class="size-3.5" />
        </Button>
      </div>
    </div>
    <FileMarkdownPreview v-if="markdown && markdownMode === 'preview'" :document="document" />
    <CodeEditor
      v-else
      v-model="draft"
      test-id="remote-file-editor"
      class="rounded-none border-0"
      :language="language"
      :extensions="fileEditorExtensions"
      :read-only="!editable"
      :line-wrapping="false"
      :reveal-line="document.line"
      @blur="save"
      @save="save"
    />
  </div>
</template>
