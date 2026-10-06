<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  TerminalIcon,
  XCircleIcon,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { Button } from "@codex-gateway/ui/button";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { Loader } from "@codex-gateway/ai-elements/loader";
import { ConfirmationAction } from "@codex-gateway/ai-elements/confirmation";
import { Badge } from "@codex-gateway/ui/badge";
import { Collapsible, CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import HighlightedCode from "@/components/common/HighlightedCode.vue";
import DeferredCollapsibleContent from "@/components/common/DeferredCollapsibleContent.vue";
import { ChatStickToBottomScrollArea } from "@/components/common/chat-virtualizer";
import CodexApprovalConfirmation from "@/components/thread/items/approval/CodexApprovalConfirmation.vue";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";
import { commandDisplayLabel } from "@/utils/thread-item-display";
import { threadItemResultText } from "@/utils/thread-items";
import { projectCodexApproval } from "./approval/presentation";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();
const { t } = useI18n();
const title = computed(() => commandDisplayLabel(props.item.command));
const rawOutput = computed(() => props.item.aggregatedOutput || threadItemResultText(props.item));
const output = computed(() => rawOutput.value);
const loadingOutput = ref(false);
const turns = useGatewayThreadTurnsStore();
const outputStart = computed(
  () => (props.item.outputWindowEnd ?? rawOutput.value.length) - rawOutput.value.length,
);
const hasLaterOutput = computed(
  () => (props.item.outputWindowEnd ?? 0) < (props.item.outputTotalLength ?? 0),
);

async function loadOutputWindow(end?: number) {
  if (props.hostId === null || props.threadId === null || typeof props.item.turnId !== "string")
    return;
  loadingOutput.value = true;
  try {
    await turns.loadCommandOutputWindow({
      hostId: props.hostId,
      threadId: props.threadId,
      turnId: props.item.turnId,
      item: props.item,
      outputEnd: end,
    });
  } finally {
    loadingOutput.value = false;
  }
}
const commandStatus = computed(() =>
  typeof props.item.status === "string" ? props.item.status : props.item.status?.type,
);
const pendingApproval = computed(() => props.item.pendingApproval || null);
const requestId = computed(() => pendingApproval.value?.requestId);
const {
  canRespond,
  responding,
  respond: respondToRequest,
} = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});
const isInProgress = computed(() => {
  const value = commandStatus.value;
  return value === "inProgress" || value === "running" || value === "active";
});
const visualStatus = computed<"running" | "completed" | "failed" | null>(() => {
  if (isInProgress.value) return "running";
  if (
    commandStatus.value === "failed" ||
    commandStatus.value === "interrupted" ||
    (typeof props.item.exitCode === "number" && props.item.exitCode !== 0)
  ) {
    return "failed";
  }
  if (commandStatus.value === "completed" || props.item.exitCode === 0) return "completed";
  return null;
});
const approvalPresentation = computed(() =>
  projectCodexApproval({
    kind: "command",
    requestId: requestId.value,
    pending: pendingApproval.value !== null,
    canRespond: canRespond.value,
    presentationId: `command-${String(props.item.id ?? props.item.turnId ?? "request")}`,
  }),
);

async function respond(result: unknown) {
  await respondToRequest(result);
}
</script>

<template>
  <Collapsible v-slot="{ open }" class="max-w-4xl text-ink-muted">
    <CollapsibleTrigger
      class="flex w-full items-center gap-2 rounded-md py-1 text-left text-[0.9375rem] hover:bg-canvas-soft"
    >
      <TerminalIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <Badge v-if="pendingApproval" variant="outline">{{ t("app.waitingApproval") }}</Badge>
      <!-- The icon is the complete command lifecycle indicator. AI Elements owns the spinner
           geometry and animation; use the primary foreground token because accent is a surface
           token in this theme and is too faint for an active command. Do not add a status badge
           beside it: app-server's raw status repeats the same information and truncates commands. -->
      <Loader
        v-if="visualStatus === 'running'"
        data-testid="command-status-running"
        class="size-4 shrink-0 text-primary"
        :aria-label="t('app.running')"
        :title="t('app.running')"
      />
      <CheckCircle2Icon
        v-else-if="visualStatus === 'completed'"
        data-testid="command-status-completed"
        class="size-4 shrink-0 text-accent-green"
        role="img"
        :aria-label="t('app.completed')"
        :title="t('app.completed')"
      />
      <XCircleIcon
        v-else-if="visualStatus === 'failed'"
        data-testid="command-status-failed"
        class="size-4 shrink-0 text-destructive"
        role="img"
        :aria-label="t('app.failed')"
        :title="t('app.failed')"
      />
      <span class="rounded-full p-0.5">
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
      </span>
    </CollapsibleTrigger>
    <DeferredCollapsibleContent :open="open">
      <!-- Height bounding and virtualization do not release the command string in Pinia. Browse
           old output in bounded windows of the authoritative item instead of restoring it all. -->
      <div
        v-if="outputStart > 0 || hasLaterOutput"
        class="flex items-center gap-2 pt-2 text-xs text-ink-faint"
      >
        <span>{{ t("app.commandOutputWindow") }}</span>
        <Button
          v-if="outputStart > 0"
          variant="ghost"
          size="sm"
          data-testid="load-earlier-command-output"
          :disabled="loadingOutput || isInProgress"
          @click="loadOutputWindow(outputStart)"
          >{{ t("app.loadEarlierOutput") }}</Button
        >
        <Button
          v-if="hasLaterOutput"
          variant="ghost"
          size="sm"
          :disabled="loadingOutput"
          @click="loadOutputWindow()"
          >{{ t("app.backToLatest") }}</Button
        >
      </div>
      <CodexApprovalConfirmation
        v-if="pendingApproval"
        class="mt-2"
        :presentation="approvalPresentation"
      >
        <template #title>{{ t("app.commandApprovalRequired") }}</template>
        <div v-if="pendingApproval.params?.reason" class="mt-1 text-accent-orange-deep">
          {{ pendingApproval.params.reason }}
        </div>
        <template #actions>
          <ConfirmationAction
            v-for="action in approvalPresentation.actions"
            :key="action.id"
            size="sm"
            :variant="action.variant"
            :disabled="responding"
            :data-testid="action.testId"
            @click="respond(action.result)"
          >
            {{ t(action.label) }}
          </ConfirmationAction>
        </template>
      </CodexApprovalConfirmation>
      <ChatStickToBottomScrollArea
        v-if="output"
        class="mt-2 max-h-56 rounded-lg border border-hairline bg-canvas-soft"
        viewport-class="max-h-56"
        allow-horizontal-overflow
        :threshold="48"
        :follow-key="rawOutput.length"
      >
        <HighlightedCode
          :code="output"
          language="shell"
          :streaming="isInProgress"
          pre-class="syntax-highlight min-w-max whitespace-pre p-3 text-xs leading-5 text-ink-secondary"
        />
      </ChatStickToBottomScrollArea>
      <div
        v-else
        class="mt-2 rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink-faint"
      >
        {{ t("app.waitingCommandOutput") }}
      </div>
    </DeferredCollapsibleContent>
  </Collapsible>
</template>
