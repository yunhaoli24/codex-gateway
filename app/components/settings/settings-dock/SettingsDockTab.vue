<script setup lang="ts">
import type { IDockviewPanelHeaderProps } from "dockview-vue";
import { computed } from "vue";
import { settingsPanelRegistry } from "./panel-registry";
import type { SettingsDockPanelParams } from "./types";

const props = defineProps<{ params: IDockviewPanelHeaderProps<SettingsDockPanelParams> }>();
const { t } = useI18n();
const title = computed(() => t(settingsPanelRegistry[props.params.params.kind].titleKey));
</script>

<template>
  <div class="flex h-full min-w-0 items-center px-3 text-sm font-medium">
    <span class="truncate">{{ title }}</span>
  </div>
</template>
