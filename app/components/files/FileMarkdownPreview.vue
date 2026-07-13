<script setup lang="ts">
import type { FilePreviewDocument } from "~~/shared/types";
import MarkdownContent from "@/components/common/MarkdownContent.vue";

defineProps<{ document: FilePreviewDocument }>();
</script>

<template>
  <div class="h-full min-w-0 max-w-full overflow-auto bg-canvas px-4 py-4 text-ink">
    <MarkdownContent :content="document.draftText" />
  </div>
</template>
