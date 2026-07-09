<script setup lang="ts">
import type { FilePreviewTab } from "~~/shared/types";
import FilePreviewPanelBody from "@/components/thread/inspector/FilePreviewPanelBody.vue";

defineProps<{
  file: FilePreviewTab;
}>();
</script>

<template>
  <div data-testid="workspace-file-panel" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="flex min-h-12 shrink-0 items-center gap-2 border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)]"
    >
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold" data-testid="workspace-panel-title">
          {{ file.title }}
        </div>
        <div class="truncate font-mono text-xs text-ink-faint">
          {{ file.path }}
        </div>
      </div>
    </div>
    <FilePreviewPanelBody :tab="file" />
  </div>
</template>
