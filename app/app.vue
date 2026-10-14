<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { Toaster } from "@codex-gateway/ui/sonner";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { useAuthStore } from "@/stores/auth";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { refreshGatewayClient } from "@/stores/gateway-bootstrap/refresh";
import { resetGatewayClientSession } from "@/stores/gateway-bootstrap/session-reset";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const bootstrap = useGatewayBootstrapStore();
const navigation = useGatewayNavigationStore();
const threadView = useGatewayThreadViewStore();
const realtime = useGatewayRealtimeStore();
const auth = useAuthStore();
const { initializing } = storeToRefs(bootstrap);
const { selectedThreadId } = storeToRefs(navigation);
const { currentThread } = storeToRefs(threadView);
const { initialized, isAuthenticated, token } = storeToRefs(auth);
const mounted = ref(false);
let activeSessionToken = "";
const pageTitle = computed(() => {
  if (!selectedThreadId.value || !currentThread.value) {
    return "Codex Gateway";
  }
  return `${titleForThread(currentThread.value)} - Codex Gateway`;
});

useHead({
  title: pageTitle,
  link: [
    { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
    { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
    { rel: "shortcut icon", href: "/favicon.ico" },
  ],
  meta: [
    { name: "theme-color", content: "#ffffff" },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-title", content: "Codex Gateway" },
  ],
});

onMounted(() => {
  mounted.value = true;
  auth.hydrate();
});

watch(
  [initialized, token],
  ([authInitialized, currentToken]) => {
    if (!authInitialized || currentToken === activeSessionToken) {
      return;
    }
    activeSessionToken = currentToken;
    // Reset on every token transition, including logged-out -> logged-in. A request rejected by
    // logout can still finish its catch/finally after the first reset; clearing again before the
    // next account hydrates prevents that stale projection from crossing the session boundary.
    resetGatewayClientSession();
    if (!currentToken) {
      return;
    }
    realtime.installHealthCheck();
    void refreshGatewayClient().catch((error) => {
      console.error("[gateway] failed to refresh app", error);
    });
  },
  { immediate: true },
);
</script>

<template>
  <NuxtPwaManifest />
  <NuxtRouteAnnouncer />
  <span
    v-if="mounted && (!isAuthenticated || !initializing)"
    data-testid="app-ready"
    class="sr-only"
    >ready</span
  >
  <Toaster rich-colors position="top-right" />
  <LoginScreen v-if="mounted && !isAuthenticated" />
  <NuxtPage v-else />
</template>
