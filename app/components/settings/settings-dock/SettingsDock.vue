<script setup lang="ts">
import { DockviewVue, themeDark, themeLight } from "dockview-vue";
import { useTerminalTheme } from "@/composables/terminal/useTerminalTheme";
import { provideSettingsDockContext } from "./context";
import { useSettingsDock } from "./useSettingsDock";
import "dockview-vue/dist/styles/dockview.css";

const emit = defineEmits<{ close: [] }>();
const { isDark } = useTerminalTheme();
const dockTheme = computed(() => (isDark.value ? themeDark : themeLight));
const dock = useSettingsDock();

provideSettingsDockContext({ close: () => emit("close") });
</script>

<template>
  <DockviewVue
    class="settings-dock min-h-0 flex-1"
    :theme="dockTheme"
    :disable-dnd="true"
    :disable-floating-groups="true"
    :locked="true"
    @ready="dock.ready"
  />
</template>

<style scoped>
.settings-dock {
  --dv-background-color: transparent;
  --dv-paneview-active-outline-color: transparent;
  --dv-tabs-and-actions-container-background-color: var(--canvas-soft);
  --dv-activegroup-visiblepanel-tab-background-color: var(--surface);
  --dv-activegroup-hiddenpanel-tab-background-color: transparent;
  --dv-tab-divider-color: var(--hairline);
  --dv-separator-border: var(--hairline);
}
</style>
