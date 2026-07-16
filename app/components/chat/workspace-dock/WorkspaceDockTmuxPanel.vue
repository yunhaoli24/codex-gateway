<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import TmuxMonitorPanel from "@/components/tmux/TmuxMonitorPanel.vue";

import type { WorkspaceDockPanelParamsFor } from "./types";

defineProps<{ params: IDockviewPanelProps<WorkspaceDockPanelParamsFor<"tmux">> }>();
</script>

<template>
  <TmuxMonitorPanel :host-id="params.params.tmuxHostId" />
</template>
