<script setup lang="ts">
import SettingsDock from "./settings-dock/SettingsDock.vue";

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <SettingsDock data-testid="settings-panel" @close="emit('close')" />
</template>
