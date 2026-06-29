<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { Toaster } from "@/components/ui/sonner";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const device = useDevice();
const { currentThread, selectedThreadId, initializing } = storeToRefs(store);
const mounted = ref(false);
const layoutName = computed(() => (device.isMobileOrTablet ? "mobile" : "default"));
const pageTitle = computed(() => {
  if (!selectedThreadId.value || !currentThread.value) {
    return "Codex Gateway";
  }
  return `${titleForThread(currentThread.value)} - Codex Gateway`;
});

useHead({
  title: pageTitle,
});

onMounted(() => {
  mounted.value = true;
  void store.refresh().catch((error) => {
    console.error("[gateway] failed to refresh app", error);
  });
});
</script>

<template>
  <NuxtRouteAnnouncer />
  <span v-if="mounted && !initializing" data-testid="app-ready" class="sr-only">ready</span>
  <Toaster rich-colors position="top-right" />
  <NuxtLayout :name="layoutName" />
</template>
