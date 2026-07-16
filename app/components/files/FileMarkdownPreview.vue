<script setup lang="ts">
import { useScroll } from "@vueuse/core";
import { nextTick, onMounted, useTemplateRef, watch } from "vue";
import type { FilePreviewDocument } from "~~/shared/types";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";

const props = defineProps<{ document: FilePreviewDocument }>();
const fileWorkspace = useGatewayFileWorkspaceStore();
const viewport = useTemplateRef<HTMLElement>("viewport");
const { x, y } = useScroll(viewport);
let restoring = true;

onMounted(async () => {
  await nextTick();
  const position = fileWorkspace.viewPositionFor(props.document.key, "markdown");
  x.value = position.left;
  y.value = position.top;
  requestAnimationFrame(() => {
    restoring = false;
  });
});

watch([x, y], ([left, top]) => {
  if (!restoring) {
    fileWorkspace.rememberViewPosition(props.document.key, "markdown", { left, top });
  }
});
</script>

<template>
  <div ref="viewport" class="h-full min-w-0 max-w-full overflow-auto bg-canvas px-4 py-4 text-ink">
    <MarkdownContent :content="document.draftText" />
  </div>
</template>
