<script setup lang="ts">
import { FolderIcon, Loader2Icon, RefreshCwIcon } from "@lucide/vue";
import { TreeRoot } from "reka-ui";
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type { RemoteDirectoryEntry } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import RemoteFileDeleteDialog from "./RemoteFileDeleteDialog.vue";
import RemoteFileTreeRow from "./RemoteFileTreeRow.vue";
import { useRemoteFileTreeActions } from "./useRemoteFileTreeActions";
import { useRemoteFileTreeReveal } from "./useRemoteFileTreeReveal";

interface FileTreeNode {
  name: string;
  path: string;
  type: RemoteDirectoryEntry["type"];
  children?: FileTreeNode[];
}

const props = defineProps<{
  hostId: number;
  threadId: string;
  rootPath: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  open: [path: string];
}>();

const fileWorkspace = useGatewayFileWorkspaceStore();
const fileActions = useRemoteFileTreeActions({
  hostId: () => props.hostId,
  threadId: () => props.threadId,
});
const selected = ref<FileTreeNode>();
const treeViewport = useTemplateRef<HTMLElement>("treeViewport");
const scope = computed(() => fileWorkspace.scopeFor(props.hostId, props.threadId));
const activePath = computed(() => scope.value?.activePath ?? null);
const rootDirectory = computed(() =>
  fileWorkspace.directoryFor(props.hostId, props.threadId, props.rootPath),
);
const expanded = computed({
  get: () => scope.value?.expandedPaths ?? [],
  set: (paths: string[]) => {
    void fileWorkspace.setExpandedPaths(props.hostId, props.threadId, paths);
  },
});
const tree = computed<FileTreeNode[]>(() =>
  props.rootPath
    ? [
        {
          name: fileName(props.rootPath),
          path: props.rootPath,
          type: "directory",
          children: childrenFor(props.rootPath),
        },
      ]
    : [],
);

useRemoteFileTreeReveal({
  hostId: () => props.hostId,
  threadId: () => props.threadId,
  rootPath: () => props.rootPath,
  visible: () => props.visible,
  activePath,
  tree,
  selected,
  viewport: treeViewport,
});

function selectNode(node: FileTreeNode | undefined) {
  selected.value = node;
  if (node?.type === "file") {
    emit("open", node.path);
  } else if (node?.type === "directory") {
    void expandUnloadedDirectory(node.path);
  }
}

async function expandUnloadedDirectory(path: string) {
  // Reka cannot infer that a lazy directory has children before its first request, so its initial
  // click may only select the row. Wait for Reka's own update first, then fill in the one missing
  // transition. Do not toggle loaded directories here: Reka remains the sole owner of collapse.
  await nextTick();
  const state = fileWorkspace.directoryFor(props.hostId, props.threadId, path);
  if (state?.loaded || expanded.value.includes(path)) return;
  await fileWorkspace.setExpandedPaths(props.hostId, props.threadId, [
    ...new Set([...expanded.value, path]),
  ]);
}

function childrenFor(path: string): FileTreeNode[] {
  const state = fileWorkspace.directoryFor(props.hostId, props.threadId, path);
  return (state?.entries ?? []).map((entry) => ({
    ...entry,
    children: entry.type === "directory" ? childrenFor(entry.path) : undefined,
  }));
}

function refreshTree() {
  // User-triggered refresh is the only full forced refresh. Activation and visibility recovery
  // refresh stale/expired directories only, avoiding a deep-tree request burst.
  void fileWorkspace.refreshExpandedDirectories(props.hostId, props.threadId, true);
}

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() || "/";
}

function fileTreeNode(value: unknown) {
  return value as FileTreeNode;
}
</script>

<template>
  <section
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas-soft/45"
    data-testid="remote-file-tree"
  >
    <div class="flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-3">
      <FolderIcon class="size-4 shrink-0 text-ink-muted" />
      <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="rootPath">
        {{ rootPath || $t("app.loadingFileTree") }}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        class="shrink-0"
        :aria-label="$t('app.refreshFiles')"
        @click="refreshTree"
      >
        <RefreshCwIcon class="size-3.5" :class="rootDirectory?.loading ? 'animate-spin' : ''" />
      </Button>
    </div>

    <div
      v-if="rootDirectory?.error"
      class="m-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"
    >
      {{ rootDirectory.error }}
    </div>
    <div
      v-else-if="!rootPath || (rootDirectory?.loading && !rootDirectory.entries.length)"
      class="flex flex-1 items-center justify-center text-sm text-ink-muted"
    >
      <Loader2Icon class="mr-2 size-4 animate-spin" />
      {{ $t("app.loadingFileTree") }}
    </div>
    <div v-else ref="treeViewport" class="min-h-0 flex-1 overflow-hidden py-2">
      <TreeRoot
        v-slot="{ flattenItems }"
        data-testid="remote-file-tree-scroll"
        :model-value="selected"
        v-model:expanded="expanded"
        :items="tree"
        :get-key="(node: FileTreeNode) => node.path"
        :get-children="(node: FileTreeNode) => node.children"
        @update:model-value="selectNode"
        class="relative h-full w-full min-w-0 list-none overflow-x-scroll overflow-y-auto outline-none"
      >
        <!--
          Keep this as a regular tree like the Host sidebar. Directory children arrive
          asynchronously and rows can widen the horizontal scroll range; virtualizing that changing
          two-axis geometry makes the vertical scrollbar repeatedly correct itself after deep
          expansion. The normal tree has one stable scroll owner and is appropriate for the number
          of entries loaded interactively here. Do not reintroduce TreeVirtualizer without isolating
          horizontal sizing and proving deep expansion remains stable.
        -->
        <RemoteFileTreeRow
          v-for="item in flattenItems"
          :key="item._id"
          :node="fileTreeNode(item.value)"
          :level="item.level"
          @download="fileActions.downloadFile"
          @copy-path="fileActions.copyAbsolutePath"
          @delete="fileActions.requestDelete"
        />
      </TreeRoot>
    </div>

    <RemoteFileDeleteDialog
      :open="Boolean(fileActions.pendingDeletePath.value)"
      :path="fileActions.pendingDeletePath.value"
      :deleting="fileActions.deleting.value"
      @cancel="fileActions.cancelDelete"
      @confirm="fileActions.confirmDelete"
    />
  </section>
</template>
