<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { Toaster } from "@/components/ui/sonner";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { useAuthStore } from "@/stores/auth";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const auth = useAuthStore();
const device = useDevice();
const { currentThread, selectedThreadId, initializing } = storeToRefs(store);
const { isAuthenticated } = storeToRefs(auth);
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
  auth.hydrate();
});

watch(
  isAuthenticated,
  (authenticated) => {
    if (!authenticated) {
      return;
    }
    void store.refresh().catch((error) => {
      console.error("[gateway] failed to refresh app", error);
    });
  },
  { immediate: true },
);
</script>

<template>
  <NuxtRouteAnnouncer />
  <span
    v-if="mounted && (!isAuthenticated || !initializing)"
    data-testid="app-ready"
    class="sr-only"
    >ready</span
  >
  <Toaster rich-colors position="top-right" />
  <LoginScreen v-if="mounted && !isAuthenticated" />
  <NuxtLayout v-else :name="layoutName" />
</template>
