<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import { onBeforeUnmount, ref } from "vue";
import FileWorkspacePane from "@/components/files/FileWorkspacePane.vue";
import { requireWorkspaceFilesPanelContext } from "./workspace-dock-context";

const props = defineProps<{ params: IDockviewPanelProps }>();
const context = requireWorkspaceFilesPanelContext();
const active = ref(props.params.api.isActive);
const activeSubscription = props.params.api.onDidActiveChange((event) => {
  active.value = event.isActive;
});
onBeforeUnmount(() => activeSubscription.dispose());
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <FileWorkspacePane
      v-if="context.selectedHostId.value && context.selectedThreadId.value"
      :layout="context.layout.value"
      :host-id="context.selectedHostId.value"
      :project-id="context.selectedProjectId.value"
      :thread-id="context.selectedThreadId.value"
      :root-path="context.rootPath.value"
      :active="active"
    />
  </div>
</template>
