<script setup lang="ts">
import type { ThreadFileChange } from "~~/shared/types";
import { ChevronDownIcon, ChevronRightIcon } from "@lucide/vue";
import { Badge } from "@codex-gateway/ui/badge";
import { CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import { useFilePreviewContext } from "@/composables/files/useFilePreviewContext";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import { absolutePath } from "@/stores/file-workspace/paths";
import { workspacePathDisplayLabel } from "@/utils/thread-item-display";
import { fileChangeKind, fileChangePath, fileChangeTargetPath } from "./utils";

const props = defineProps<{
  change: ThreadFileChange;
  open: boolean;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const context = useFilePreviewContext();
const workspace = useGatewayFileWorkspaceStore();
const targetPath = computed(() => fileChangeTargetPath(props.change));
const displayPath = computed(() => targetPath.value ?? fileChangePath(props.change));
const canOpen = computed(
  () => targetPath.value !== null && props.hostId !== null && props.threadId !== null,
);
const toggleLabel = computed(() =>
  t(props.open ? "app.collapseFileDiff" : "app.expandFileDiff", { path: displayPath.value }),
);
const kindLabel = computed(() => {
  const kind = fileChangeKind(props.change).toLowerCase();
  if (kind.includes("add") || kind === "create") return t("app.fileAdded");
  if (kind.includes("delete") || kind === "remove") return t("app.fileDeleted");
  if (kind.includes("move") || kind.includes("rename")) return t("app.fileMoved");
  return t("app.fileUpdated");
});

function openFile() {
  if (targetPath.value === null || props.hostId === null || props.threadId === null) return;
  const cwd = context?.cwd.value ?? null;
  // Reuse the workspace action: it activates the existing desktop/mobile viewer for this thread.
  // Opening a document must not change the independently controlled diff disclosure.
  void workspace.openFile({
    hostId: props.hostId,
    threadId: props.threadId,
    cwd,
    path: cwd === null ? targetPath.value : absolutePath(cwd, targetPath.value),
  });
}
</script>

<template>
  <!-- Sibling controls avoid nesting the file action inside an accordion button. Both the arrow
       and trailing space toggle the diff; the file name only opens the document. -->
  <div class="flex min-w-0 items-center text-sm">
    <CollapsibleTrigger as-child>
      <button
        type="button"
        :aria-label="toggleLabel"
        class="flex size-10 shrink-0 items-center justify-center rounded-l-lg hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDownIcon v-if="open" class="size-4 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 text-ink-faint" />
      </button>
    </CollapsibleTrigger>
    <button
      type="button"
      :disabled="!canOpen"
      :title="displayPath"
      :aria-label="t('app.openChangedFile', { path: displayPath })"
      class="min-w-0 truncate py-2 text-left font-mono text-[0.8125rem] text-ink-secondary hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:text-ink-faint disabled:no-underline"
      @click="openFile"
    >
      {{ workspacePathDisplayLabel(displayPath, context?.workspaceRoot.value) }}
    </button>
    <CollapsibleTrigger as-child>
      <button
        type="button"
        :aria-label="toggleLabel"
        class="flex min-h-10 min-w-10 flex-1 items-center justify-end rounded-r-lg px-3 py-2 hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Badge variant="outline">{{ kindLabel }}</Badge>
      </button>
    </CollapsibleTrigger>
  </div>
</template>
