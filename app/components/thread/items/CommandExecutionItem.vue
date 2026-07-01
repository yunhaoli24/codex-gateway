<script setup lang="ts">
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  TerminalIcon,
  XCircleIcon,
} from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import HighlightedCode from "@/components/common/HighlightedCode.vue";
import TanStackStickToBottomScrollArea from "@/components/common/TanStackStickToBottomScrollArea.vue";
import { useServerRequestResponder } from "@/composables/useServerRequestResponder";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();
const { t } = useI18n();
const title = computed(() => props.item.command || "Command");
const rawOutput = computed(() => props.item.aggregatedOutput || props.item.result?.text || "");
const output = computed(() => rawOutput.value);
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

async function respond(decision: "accept" | "decline") {
  await respondToRequest({ decision });
}
</script>

<template>
  <Collapsible v-slot="{ open }" class="max-w-4xl text-ink-muted">
    <CollapsibleTrigger
      class="flex w-full items-center gap-2 rounded-md py-1 text-left text-[0.9375rem] hover:bg-canvas-soft"
    >
      <TerminalIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <Badge v-if="commandStatus" variant="secondary">{{ commandStatus }}</Badge>
      <Badge v-if="pendingApproval" variant="outline">{{ t("app.waitingApproval") }}</Badge>
      <Badge v-if="isInProgress" variant="outline">{{ t("app.running") }}</Badge>
      <CheckCircle2Icon v-if="item.exitCode === 0" class="size-4 shrink-0 text-accent-green" />
      <XCircleIcon v-else-if="item.exitCode" class="size-4 shrink-0 text-destructive" />
      <span class="rounded-full p-0.5">
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
      </span>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div
        v-if="pendingApproval"
        class="mt-2 rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange-deep"
      >
        <div class="font-medium">{{ t("app.commandApprovalRequired") }}</div>
        <div v-if="pendingApproval.params?.reason" class="mt-1 text-accent-orange-deep">
          {{ pendingApproval.params.reason }}
        </div>
        <div v-if="canRespond" class="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            :disabled="responding"
            data-testid="command-approval-accept"
            @click="respond('accept')"
          >
            {{ t("app.approve") }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="responding"
            data-testid="command-approval-decline"
            @click="respond('decline')"
          >
            {{ t("app.decline") }}
          </Button>
        </div>
        <div v-else class="mt-2 text-xs text-accent-orange-deep">
          {{ t("app.serverRequestResolved") }}
        </div>
      </div>
      <TanStackStickToBottomScrollArea
        v-if="output"
        class="mt-2 max-h-56 rounded-lg border border-hairline bg-canvas-soft"
        viewport-class="max-h-56"
        horizontal
        natural-height
        :threshold="48"
        :estimate-size="44"
        :follow-key="rawOutput.length"
      >
        <HighlightedCode
          :code="output"
          language="shell"
          pre-class="syntax-highlight min-w-max whitespace-pre p-3 text-xs leading-5 text-ink-secondary"
        />
      </TanStackStickToBottomScrollArea>
      <div
        v-else
        class="mt-2 rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink-faint"
      >
        {{ t("app.waitingCommandOutput") }}
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
