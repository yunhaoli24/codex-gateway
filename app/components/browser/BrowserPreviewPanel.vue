<script setup lang="ts">
import { ExternalLinkIcon, LoaderCircleIcon, RefreshCwIcon, ShieldAlertIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { openBrowserPreview } from "@/stores/gateway-browser-transport";
import { setBrowserPreviewInsecureTls } from "@/stores/gateway-browser-transport";

const props = defineProps<{ panelId: string }>();
const browser = useGatewayBrowserStore();
const { panels, sessions, frameWarnings } = storeToRefs(browser);
const iframe = ref<HTMLIFrameElement | null>(null);
const opening = ref(false);
const error = ref("");
const panel = computed(() => panels.value[props.panelId] ?? null);
const session = computed(() =>
  Object.values(sessions.value).find((item) => item.panelId === props.panelId),
);
const warning = computed(() =>
  session.value ? frameWarnings.value[session.value.sessionId] : undefined,
);

watch(
  [panel, session],
  async ([target, activeSession]) => {
    if (!target || activeSession || opening.value) return;
    opening.value = true;
    error.value = "";
    try {
      await openBrowserPreview(target);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      opening.value = false;
    }
  },
  { immediate: true },
);

function reload() {
  if (!iframe.value || !session.value) return;
  iframe.value.src = "about:blank";
  void nextTick(() => {
    if (iframe.value && session.value) iframe.value.src = previewTargetUrl(session.value);
  });
}

function previewTargetUrl(activeSession: NonNullable<typeof session.value>) {
  const target = new URL(activeSession.targetUrl);
  return `${activeSession.previewOrigin}${target.pathname}${target.search}${target.hash}`;
}

async function toggleInsecureTls() {
  if (!session.value) return;
  await setBrowserPreviewInsecureTls(session.value.sessionId, !session.value.allowInsecureTls);
  reload();
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
    <div class="flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-2">
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="$t('app.reload')"
        @click="reload"
      >
        <RefreshCwIcon class="size-4" />
      </Button>
      <div
        class="min-w-0 flex-1 truncate rounded-md bg-canvas-soft px-3 py-1 text-sm text-ink-muted"
      >
        {{ panel?.targetUrl }}
      </div>
      <Button
        v-if="session && session.targetUrl.startsWith('https://')"
        variant="ghost"
        size="icon"
        class="size-8"
        :class="session.allowInsecureTls ? 'text-warning' : ''"
        :aria-label="$t('app.allowInsecureTls')"
        :title="$t('app.allowInsecureTls')"
        @click="toggleInsecureTls"
      >
        <ShieldAlertIcon class="size-4" />
      </Button>
      <Button
        v-if="session"
        as="a"
        :href="session.previewOrigin"
        target="_blank"
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="$t('app.openExternally')"
      >
        <ExternalLinkIcon class="size-4" />
      </Button>
    </div>
    <div
      v-if="warning"
      class="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-sm"
    >
      <ShieldAlertIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ $t("app.browserFrameBlocked") }}</span>
      <a v-if="session" :href="session.previewOrigin" target="_blank" class="font-medium underline">
        {{ $t("app.openExternally") }}
      </a>
    </div>
    <div v-if="opening" class="grid min-h-0 flex-1 place-items-center text-ink-muted">
      <LoaderCircleIcon class="size-5 animate-spin" />
    </div>
    <div v-else-if="error" class="grid min-h-0 flex-1 place-items-center p-6 text-sm text-danger">
      {{ error }}
    </div>
    <iframe
      v-else-if="session"
      ref="iframe"
      :src="session.bootstrapUrl"
      class="min-h-0 flex-1 border-0 bg-white"
      :title="panel?.title"
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  </section>
</template>
