<script setup lang="ts">
import type { ThreadFileChange, ThreadHistoryItem } from "~~/shared/types";
import { FilePenIcon, Loader2Icon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Collapsible, CollapsibleContent } from "@codex-gateway/ui/collapsible";
import FileChangeApprovalBar from "./FileChangeApprovalBar.vue";
import FileChangeDiffPanel from "./FileChangeDiffPanel.vue";
import FileChangeOutputPanel from "./FileChangeOutputPanel.vue";
import FileChangeHeader from "./FileChangeHeader.vue";
import { fileChangeKey } from "./utils";
import { threadItemResultText } from "@/utils/thread-items";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();
const { t } = useI18n();
const fileChanges = computed(() => (Array.isArray(props.item.changes) ? props.item.changes : []));
const openChangeKeys = ref(new Set<string>());
const initializedChangeKeys = new Set<string>();
const output = computed(() => props.item.aggregatedOutput || threadItemResultText(props.item));
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

function isChangeOpen(change: ThreadFileChange) {
  return openChangeKeys.value.has(fileChangeKey(change));
}

function setChangeOpen(change: ThreadFileChange, open: boolean) {
  const next = new Set(openChangeKeys.value);
  const key = fileChangeKey(change);
  if (open) {
    next.add(key);
  } else {
    next.delete(key);
  }
  openChangeKeys.value = next;
}

watch(
  () => fileChanges.value.map((change) => fileChangeKey(change)),
  (changes) => {
    const currentKeys = new Set(changes);
    const nextOpenKeys = new Set([...openChangeKeys.value].filter((key) => currentKeys.has(key)));
    for (const key of initializedChangeKeys) {
      if (!currentKeys.has(key)) initializedChangeKeys.delete(key);
    }
    for (const key of changes) {
      if (initializedChangeKeys.has(key)) continue;
      initializedChangeKeys.add(key);
      nextOpenKeys.add(key);
    }
    // A visible file change starts expanded, matching the Agent timeline's historical behavior.
    // Once the user closes it, keep the expensive diff renderer unmounted and remember that choice
    // while streaming updates mutate the same change. New files still open on first appearance.
    openChangeKeys.value = nextOpenKeys;
  },
  { immediate: true },
);
</script>

<template>
  <div class="max-w-4xl text-ink-secondary">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <Loader2Icon v-if="isInProgress" class="size-4 animate-spin text-primary" />
      <FilePenIcon v-else class="size-4" />
      <span>{{ title }}</span>
      <Badge v-if="itemStatus" variant="secondary">{{ itemStatus }}</Badge>
      <Badge v-if="pendingApproval" variant="outline">{{ t("app.waitingApproval") }}</Badge>
      <Badge v-if="isInProgress" variant="outline">{{ t("app.running") }}</Badge>
    </div>
    <div v-if="pendingApproval">
      <FileChangeApprovalBar
        :pending-approval="pendingApproval"
        :host-id="hostId"
        :thread-id="threadId"
        :presentation-id="`file-${String(item.id ?? item.turnId ?? 'request')}`"
      />
    </div>
    <div v-if="fileChanges.length" class="mt-3 space-y-2">
      <FileChangeOutputPanel v-if="output" :output="output" :streaming="isInProgress" />
      <Collapsible
        v-for="change in fileChanges"
        :key="fileChangeKey(change)"
        v-slot="{ open }"
        :open="isChangeOpen(change)"
        class="rounded-lg border border-hairline bg-surface"
        @update:open="setChangeOpen(change, $event)"
      >
        <FileChangeHeader :change="change" :open="open" :host-id="hostId" :thread-id="threadId" />
        <CollapsibleContent>
          <FileChangeDiffPanel v-if="open" :change="change" :streaming="isInProgress" />
        </CollapsibleContent>
      </Collapsible>
    </div>
    <FileChangeOutputPanel
      v-else-if="output"
      :output="output"
      :streaming="isInProgress"
      extra-class="mt-3"
    />
    <div
      v-else-if="isInProgress"
      class="mt-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink-muted"
    >
      {{ t("app.waitingFileChanges") }}
    </div>
  </div>
</template>
