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
import type { FilePreviewTab } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import FilePreviewCodePanel from "@/components/thread/inspector/FilePreviewCodePanel.vue";
import FilePreviewMarkdownPanel from "@/components/thread/inspector/FilePreviewMarkdownPanel.vue";
import { useTerminalTheme } from "@/composables/useTerminalTheme";
import { useGatewayFilePreviewStore } from "@/stores/gateway-file-preview";

const props = defineProps<{
  tab: FilePreviewTab;
}>();

const { t, locale } = useI18n();
const filePreview = useGatewayFilePreviewStore();
const { isDark } = useTerminalTheme();

const file = computed(() => filePreview.fileForTab(props.tab.key));
const viewerTheme = computed(() => (isDark.value ? "dark" : "light"));
const viewerLocale = computed(() => (locale.value === "en" ? "en-US" : "zh-CN"));
const plugins: PreviewPlugin[] = [
  imagePlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  officePlugin({ pdf: { workerSrc: pdfWorkerSrc } }),
  fallbackPlugin(),
];
const isCodePreview = computed(() => Boolean(props.tab.text));
const isMarkdownPreview = computed(() =>
  isMarkdownPreviewPath(props.tab.path, props.tab.contentType),
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
    <div v-if="tab.loading" class="flex flex-1 items-center justify-center text-sm text-ink-muted">
      <Loader2Icon class="mr-2 size-4 animate-spin" />
      {{ t("app.loadingFilePreview") }}
    </div>

    <div
      v-else-if="tab.error"
      class="m-3 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div class="flex items-start gap-2">
        <FileWarningIcon class="mt-0.5 size-4 shrink-0" />
        <div class="min-w-0">
          <div class="font-medium">{{ t("app.filePreviewFailed") }}</div>
          <div class="mt-1 whitespace-pre-wrap break-words text-destructive/85">
            {{ tab.error }}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="self-start"
        @click="filePreview.openFilePreview(tab)"
      >
        {{ t("app.retry") }}
      </Button>
    </div>

    <FilePreviewMarkdownPanel v-else-if="isMarkdownPreview" :tab="tab" />

    <FilePreviewCodePanel v-else-if="isCodePreview" :tab="tab" />

    <OpenFileViewer
      v-else-if="file"
      :file="file"
      :file-name="tab.title"
      :mime-type="tab.contentType"
      width="100%"
      height="100%"
      fit="contain"
      :toolbar="{ download: true, fullscreen: true, print: true, search: true }"
      :theme="viewerTheme"
      :locale="viewerLocale"
      :plugins="plugins"
      class-name="h-full"
    />

    <div
      v-else
      class="flex flex-1 items-center justify-center px-4 text-center text-sm text-ink-muted"
    >
      {{ t("app.noFilePreview") }}
    </div>
  </div>
</template>
