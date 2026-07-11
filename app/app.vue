<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { Toaster } from "@/components/ui/sonner";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { useAuthStore } from "@/stores/auth";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const realtime = useGatewayRealtimeStore();
const terminal = useGatewayTerminalStore();
const threadTurns = useGatewayThreadTurnsStore();
const workspaceLayout = useGatewayWorkspaceLayoutStore();
const auth = useAuthStore();
const device = useDevice();
const { currentThread, selectedThreadId, initializing } = storeToRefs(store);
const { initialized, isAuthenticated, token } = storeToRefs(auth);
const mounted = ref(false);
let activeSessionToken = "";
const layoutName = computed(() => (device.isMobileOrTablet ? "mobile" : "default"));
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
    { rel: "manifest", href: "/site.webmanifest" },
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
    const hadPreviousSession = Boolean(activeSessionToken);
    activeSessionToken = currentToken;
    if (hadPreviousSession || !currentToken) {
      resetClientSessionState();
    }
    if (!currentToken) {
      return;
    }
    realtime.installHealthCheck();
    void store.refresh().catch((error) => {
      console.error("[gateway] failed to refresh app", error);
    });
  },
  { immediate: true },
);

function resetClientSessionState() {
  realtime.resetForSessionChange();
  store.resetState();
  terminal.resetState();
  threadTurns.resetState();
  workspaceLayout.resetRuntimeState();
}
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
