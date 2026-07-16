<script setup lang="ts">
import AppearanceSettingsTab from "../AppearanceSettingsTab.vue";
import { requireSettingsDockContext } from "./context";

const context = requireSettingsDockContext();
</script>

<template>
  <div class="h-full overflow-y-auto p-5">
    <AppearanceSettingsTab @close="context.close" />
  </div>
</template>
