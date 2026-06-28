<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, FilePenIcon, Loader2Icon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import HighlightedCode from "@/components/common/HighlightedCode.vue";
import StickToBottomScrollArea from "@/components/common/StickToBottomScrollArea.vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { languageFromPath } from "@/utils/code-highlight";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();
const store = useGatewayStore();
const responding = ref(false);
const fileChanges = computed(() => (Array.isArray(props.item.changes) ? props.item.changes : []));
const output = computed(() => props.item.aggregatedOutput || props.item.result?.text || "");
const itemStatus = computed(() =>
  typeof props.item.status === "string" ? props.item.status : props.item.status?.type,
);
const pendingApproval = computed(() => props.item.pendingApproval || null);
const isInProgress = computed(() => {
  const value = itemStatus.value;
  return value === "inProgress" || value === "running" || value === "active";
});
const title = computed(() => {
  if (isInProgress.value && !fileChanges.value.length) {
    return t("app.editingFiles");
  }
  return t("app.filesChanged", { count: fileChanges.value.length });
});

function changePath(change: Record<string, any>) {
  return change.path || change.filePath || change.pathAfter || change.pathBefore || "unknown";
}

function changeKind(change: Record<string, any>) {
  const kind = change.kind;
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object") return kind.type || kind.kind || "update";
  return "update";
}

function changeKindLabel(change: Record<string, any>) {
  const kind = changeKind(change).toLowerCase();
  if (kind.includes("add") || kind === "create") return t("app.fileAdded");
  if (kind.includes("delete") || kind === "remove") return t("app.fileDeleted");
  if (kind.includes("move") || kind.includes("rename")) return t("app.fileMoved");
  return t("app.fileUpdated");
}

function changeDiff(change: Record<string, any>) {
  return change.diff || "";
}

function diffMarkdown(change: Record<string, any>) {
  const diff = changeDiff(change);
  return diff ? `\`\`\`diff\n${diff.replaceAll("```", "``\\`")}\n\`\`\`` : "";
}

function changeFollowKey(change: Record<string, any>) {
  return `${changePath(change)}:${changeDiff(change).length}`;
}

function changeLanguage(change: Record<string, any>) {
  return languageFromPath(changePath(change));
}

async function respond(decision: "accept" | "decline") {
  if (!pendingApproval.value?.requestId || !store.selectedThreadId) {
    return;
  }
  responding.value = true;
  try {
    await store.respondToServerRequest(store.selectedThreadId, pendingApproval.value.requestId, {
      decision,
    });
  } finally {
    responding.value = false;
  }
}
</script>

<template>
  <div class="max-w-4xl text-[#5f6970]">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <Loader2Icon v-if="isInProgress" class="size-4 animate-spin text-sky-500" />
      <FilePenIcon v-else class="size-4" />
      <span>{{ title }}</span>
      <Badge v-if="itemStatus" variant="secondary">{{ itemStatus }}</Badge>
      <Badge v-if="pendingApproval" variant="outline">{{ t("app.waitingApproval") }}</Badge>
      <Badge v-if="isInProgress" variant="outline">{{ t("app.running") }}</Badge>
    </div>
    <div
      v-if="pendingApproval"
      class="mt-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <div class="font-medium">{{ t("app.fileApprovalRequired") }}</div>
      <div v-if="pendingApproval.params?.reason" class="mt-1 text-amber-800">
        {{ pendingApproval.params.reason }}
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          :disabled="responding"
          data-testid="file-approval-accept"
          @click="respond('accept')"
        >
          {{ t("app.approve") }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="responding"
          data-testid="file-approval-decline"
          @click="respond('decline')"
        >
          {{ t("app.decline") }}
        </Button>
      </div>
    </div>
    <div v-if="fileChanges.length" class="mt-3 space-y-2">
      <ScrollArea v-if="output" class="h-56 rounded-lg border border-black/10 bg-[#f6f6f6]">
        <HighlightedCode
          :code="output"
          language="shell"
          pre-class="syntax-highlight p-3 text-xs leading-5 text-[#3d4145]"
        />
      </ScrollArea>
      <Collapsible
        v-for="change in fileChanges"
        :key="`${changePath(change)}-${changeKind(change)}`"
        v-slot="{ open }"
        default-open
        class="rounded-lg border border-black/10 bg-[#fbfbfb]"
      >
        <CollapsibleTrigger
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
        >
          <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
          <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
          <span class="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-[#31363a]">{{
            changePath(change)
          }}</span>
          <Badge variant="outline">{{ changeKindLabel(change) }}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <StickToBottomScrollArea
            v-if="changeDiff(change)"
            class="diff-markdown max-h-[min(55vh,26rem)] border-t border-black/10 bg-white"
            viewport-class="max-h-[min(55vh,26rem)]"
            :threshold="48"
            :follow-key="changeFollowKey(change)"
          >
            <MarkdownContent
              :content="diffMarkdown(change)"
              :diff-language="changeLanguage(change)"
              compact
            />
          </StickToBottomScrollArea>
          <div v-else class="border-t border-black/10 px-3 py-2 text-sm text-[#9aa1a6]">
            {{ t("app.noDiff") }}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
    <ScrollArea v-else-if="output" class="mt-3 h-56 rounded-lg border border-black/10 bg-[#f6f6f6]">
      <HighlightedCode
        :code="output"
        language="shell"
        pre-class="syntax-highlight p-3 text-xs leading-5 text-[#3d4145]"
      />
    </ScrollArea>
    <div
      v-else-if="isInProgress"
      class="mt-3 rounded-lg border border-black/10 bg-[#fbfbfb] px-3 py-2 text-sm text-[#8d9499]"
    >
      {{ t("app.waitingFileChanges") }}
    </div>
  </div>
</template>
