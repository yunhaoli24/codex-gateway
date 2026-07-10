<script setup lang="ts">
import { FileWarningIcon, Loader2Icon } from "@lucide/vue";
import {
  fallbackPlugin,
  imagePlugin,
  officePlugin,
  pdfPlugin,
  type PreviewPlugin,
} from "@open-file-viewer/core";
import { OpenFileViewer } from "@open-file-viewer/vue";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { computed } from "vue";
import { isMarkdownPreviewPath } from "~~/shared/file-preview";
import type { FilePreviewDocument } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import FileCodePreview from "@/components/files/FileCodePreview.vue";
import FileMarkdownPreview from "@/components/files/FileMarkdownPreview.vue";
import { useTerminalTheme } from "@/composables/useTerminalTheme";
import { useGatewayFileWorkspaceStore } from "@/stores/gateway-file-workspace";

const props = defineProps<{
  document: FilePreviewDocument;
}>();

const { t, locale } = useI18n();
const fileWorkspace = useGatewayFileWorkspaceStore();
const { isDark } = useTerminalTheme();
const file = computed(() => fileWorkspace.fileForDocument(props.document.key));
const viewerTheme = computed(() => (isDark.value ? "dark" : "light"));
const viewerLocale = computed(() => (locale.value === "en" ? "en-US" : "zh-CN"));
const plugins: PreviewPlugin[] = [
  imagePlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  officePlugin({ pdf: { workerSrc: pdfWorkerSrc } }),
  fallbackPlugin(),
];
const isMarkdownPreview = computed(
  () =>
    props.document.previewKind === "text" &&
    isMarkdownPreviewPath(props.document.path, props.document.contentType),
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
    <div
      v-if="document.loading"
      class="flex flex-1 items-center justify-center text-sm text-ink-muted"
    >
      <Loader2Icon class="mr-2 size-4 animate-spin" />
      {{ t("app.loadingFilePreview") }}
    </div>
    <div
      v-else-if="document.error"
      class="m-3 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div class="flex items-start gap-2">
        <FileWarningIcon class="mt-0.5 size-4 shrink-0" />
        <div class="min-w-0">
          <div class="font-medium">{{ t("app.filePreviewFailed") }}</div>
          <div class="mt-1 whitespace-pre-wrap break-words text-destructive/85">
            {{ document.error }}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="self-start"
        @click="fileWorkspace.reloadDocument(document)"
      >
        {{ t("app.retry") }}
      </Button>
    </div>
    <FileMarkdownPreview v-else-if="isMarkdownPreview" :document="document" />
    <FileCodePreview v-else-if="document.previewKind === 'text'" :document="document" />
    <div
      v-else-if="document.previewKind === 'binary'"
      class="flex min-h-0 flex-1 items-center justify-center bg-canvas p-6"
    >
      <div
        class="max-w-lg rounded-xl border border-hairline bg-surface px-5 py-4 text-center shadow-sm"
      >
        <FileWarningIcon class="mx-auto size-7 text-ink-faint" />
        <div class="mt-3 text-sm font-semibold text-ink">{{ t("app.binaryFileTitle") }}</div>
        <div class="mt-1.5 text-sm leading-6 text-ink-muted">
          {{ t("app.binaryFileDescription") }}
        </div>
      </div>
    </div>
    <OpenFileViewer
      v-else-if="document.previewKind === 'document' && file"
      :key="document.updatedAt"
      :file="file"
      :file-name="document.title"
      :mime-type="document.contentType"
      width="100%"
      height="100%"
      fit="contain"
      :toolbar="{ download: true, fullscreen: true, print: true, search: true }"
      :theme="viewerTheme"
      :locale="viewerLocale"
      :plugins="plugins"
      class-name="h-full"
    />
  </div>
</template>
