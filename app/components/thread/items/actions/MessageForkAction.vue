<script setup lang="ts">
import { computed, ref } from "vue";
import { GitForkIcon } from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { expectThreadForked } from "@/stores/gateway-realtime/response-parsers";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { messageFromError } from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";
import type { ThreadHistoryItem } from "~~/shared/types";
import { canRestoreUserMessage, draftFromUserMessage } from "./fork-draft";

const props = defineProps<{
  hostId: number;
  threadId: string;
  turnId: string;
  boundary: "before" | "after";
  item: ThreadHistoryItem;
}>();
const { t } = useI18n();
const pending = ref(false);
const supported = computed(() => props.boundary !== "before" || canRestoreUserMessage(props.item));
async function fork() {
  if (pending.value || !supported.value) return;
  const { hostId, threadId, turnId, boundary, item } = props;
  const views = useGatewayThreadViewStore();
  const epoch = views.viewEpoch;
  const sessionIsCurrent = captureSessionEpoch();
  const draft = boundary === "before" ? draftFromUserMessage(item) : null;
  pending.value = true;
  try {
    const result = await useGatewayRealtimeStore().request(
      (requestId) => ({
        type: "thread.fork",
        requestId,
        hostId,
        threadId,
        turnId,
        boundary,
      }),
      expectThreadForked,
    );
    if (!sessionIsCurrent()) return;
    // Official fork boundaries are Turns, not items. A user-message fork keeps earlier history
    // and stages its text/images in the new draft; it never rewrites or resends the original.
    if (draft !== null)
      useGatewayComposerStore().saveComposerDraft(hostId, result.thread.id, draft);
    // Completing a fork must not undo navigation that happened while SSH/RPC was busy.
    if (views.viewEpoch !== epoch) return;
    await views.openThread(result.thread.id, {
      hostId,
      cwd: result.thread.cwd,
    });
  } catch (error: unknown) {
    if (sessionIsCurrent()) {
      const bootstrap = useGatewayBootstrapStore();
      bootstrap.setError(messageFromError(error, t("app.forkFailed"), bootstrap.errorLabels), {
        hostId,
        threadId,
      });
    }
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <span class="inline-flex" :title="!supported ? t('app.forkUnsupportedInput') : undefined">
    <Button
      variant="ghost"
      size="icon"
      class="size-8 shrink-0 text-ink-muted"
      :disabled="pending || !supported"
      :aria-label="t(supported ? 'app.forkMessage' : 'app.forkUnsupportedInput')"
      :title="
        t(
          !supported
            ? 'app.forkUnsupportedInput'
            : boundary === 'before'
              ? 'app.forkBeforeTurn'
              : 'app.forkAfterTurn',
        )
      "
      data-testid="message-fork"
      @click="fork"
    >
      <GitForkIcon class="size-4" />
    </Button>
  </span>
</template>
