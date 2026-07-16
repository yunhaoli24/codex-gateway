<script setup lang="ts">
import type { IDockviewPanelProps } from "dockview-vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref } from "vue";
import TerminalPanel from "@/components/terminal/TerminalPanel.vue";

import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import type { WorkspaceDockPanelParamsFor } from "./types";

const props = defineProps<{
  params: IDockviewPanelProps<WorkspaceDockPanelParamsFor<"terminal">>;
}>();
const terminalStore = useGatewayTerminalStore();
const { terminalSessions } = storeToRefs(terminalStore);
const session = computed(() => terminalSessions.value[props.params.params.sessionId] ?? null);
const active = ref(props.params.api.isActive);
const activeSubscription = props.params.api.onDidActiveChange((event) => {
  active.value = event.isActive;
});
onBeforeUnmount(() => activeSubscription.dispose());
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <TerminalPanel v-if="session" :session="session" :active="active" />
  </div>
</template>
