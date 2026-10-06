<script setup lang="ts">
import type {
  FileViewer,
  PreviewLocale,
  PreviewSource,
  PreviewTheme,
  PreviewToolbarOptions,
} from "@codex-gateway/browser-runtime/open-file-viewer";
import ensureError from "ensure-error";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadOpenFileViewerRuntime } from "@/utils/browser-runtime/open-file-viewer";

const props = defineProps<{
  file: PreviewSource;
  fileName: string;
  mimeType: string;
  theme: PreviewTheme;
  locale: PreviewLocale;
  toolbar: PreviewToolbarOptions;
}>();

const { t } = useI18n();
const container = ref<HTMLElement>();
const loadError = ref("");
let viewer: FileViewer | undefined;
let lifecycleVersion = 0;

async function mountViewer(): Promise<void> {
  const target = container.value;
  if (target === undefined) {
    return;
  }

  const version = ++lifecycleVersion;
  viewer?.destroy();
  viewer = undefined;
  loadError.value = "";

  try {
    const runtime = await loadOpenFileViewerRuntime();
    if (version !== lifecycleVersion || container.value !== target) {
      return;
    }

    const pdfOptions = {
      workerSrc: runtime.pdfWorkerUrl,
      legacyWorkerSrc: runtime.pdfLegacyWorkerUrl,
    };
    viewer = runtime.createViewer({
      container: target,
      file: props.file,
      fileName: props.fileName,
      mimeType: props.mimeType,
      width: "100%",
      height: "100%",
      fit: "contain",
      toolbar: props.toolbar,
      theme: props.theme,
      locale: props.locale,
      plugins: [
        runtime.imagePlugin(),
        runtime.pdfPlugin(pdfOptions),
        runtime.officePlugin({ pdf: pdfOptions }),
        runtime.fallbackPlugin(),
      ],
    });
  } catch (error: unknown) {
    if (version === lifecycleVersion) {
      loadError.value = ensureError(error).message;
    }
  }
}

watch(
  () => [props.file, props.fileName, props.mimeType, props.theme, props.locale, props.toolbar],
  () => void mountViewer(),
  { flush: "post" },
);

onMounted(() => void mountViewer());
onBeforeUnmount(() => {
  lifecycleVersion += 1;
  viewer?.destroy();
  viewer = undefined;
});
</script>

<template>
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <div ref="container" class="h-full" />
    <div
      v-if="loadError.length > 0"
      class="absolute inset-3 flex items-center justify-center rounded-xl border border-destructive/25 bg-surface p-4 text-center text-sm text-destructive shadow-sm"
    >
      <div class="min-w-0">
        <div class="font-medium">{{ t("app.filePreviewFailed") }}</div>
        <div class="mt-1 whitespace-pre-wrap break-words text-destructive/85">
          {{ loadError }}
        </div>
      </div>
    </div>
  </div>
</template>
