<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import BrowserPreviewPanel from "@/components/browser/BrowserPreviewPanel.vue";

defineProps<{ params: IDockviewPanelProps<{ browserPanelId: string }> }>();
</script>

<template>
  <BrowserPreviewPanel :panel-id="params.params.browserPanelId" />
</template>
