<script setup lang="ts">
// A real page enables Nuxt's built-in automatic-immediate reload plugin. A pages-disabled app
// receives manifest update events but does not register that plugin, so detection alone cannot
// refresh an old client. Keep authentication and shared session lifecycle in app.vue.
definePageMeta({ layout: false });

const device = useDevice();
const layoutName = computed(() => (device.isMobileOrTablet ? "mobile" : "default"));
</script>

<template>
  <NuxtLayout :name="layoutName" />
</template>
