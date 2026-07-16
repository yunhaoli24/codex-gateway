<script setup lang="ts">
import ConfigSettingsTab from "../ConfigSettingsTab.vue";
import { requireSettingsDockContext } from "./context";

const context = requireSettingsDockContext();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-5">
    <ConfigSettingsTab @close="context.close" />
  </div>
</template>
