<script setup lang="ts">
import type { FilePreviewTab } from "~~/shared/types";
import MarkdownContent from "@/components/common/MarkdownContent.vue";

defineProps<{
  tab: FilePreviewTab;
}>();
</script>

<template>
  <div class="h-full overflow-auto bg-canvas px-4 py-4 text-ink">
    <MarkdownContent :content="tab.text" />
  </div>
</template>
