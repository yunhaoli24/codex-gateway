<script setup lang="ts">
import HostSettingsTab from "../HostSettingsTab.vue";
import { requireSettingsDockContext } from "./context";

const context = requireSettingsDockContext();
</script>

<template>
  <div class="h-full overflow-y-auto p-5">
    <HostSettingsTab @close="context.close" />
  </div>
</template>
