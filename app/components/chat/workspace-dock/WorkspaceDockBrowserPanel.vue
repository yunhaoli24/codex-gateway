<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import BrowserPreviewPanel from "@/components/browser/BrowserPreviewPanel.vue";

import type { WorkspaceDockPanelParamsFor } from "./types";

defineProps<{ params: IDockviewPanelProps<WorkspaceDockPanelParamsFor<"browser">> }>();
</script>

<template>
  <BrowserPreviewPanel :panel-id="params.params.browserPanelId" />
</template>
