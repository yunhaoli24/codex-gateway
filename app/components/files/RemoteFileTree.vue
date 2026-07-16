<script setup lang="ts">
import { FolderIcon, Loader2Icon, RefreshCwIcon } from "@lucide/vue";
import { TreeRoot, TreeVirtualizer } from "reka-ui";
import { computed, ref, watch } from "vue";
import type { RemoteDirectoryEntry } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import RemoteFileDeleteDialog from "./RemoteFileDeleteDialog.vue";
import RemoteFileTreeRow from "./RemoteFileTreeRow.vue";
import { useRemoteFileTreeActions } from "./useRemoteFileTreeActions";

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
const scope = computed(() => fileWorkspace.scopeFor(props.hostId, props.threadId));
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

watch(
  () => props.rootPath,
  (path) => {
    if (path) {
      void fileWorkspace.loadDirectory(props.hostId, props.threadId, path);
    }
  },
  { immediate: true },
);

watch(selected, (node) => {
  if (node?.type === "file") {
    emit("open", node.path);
  }
});

function childrenFor(path: string): FileTreeNode[] {
  const state = fileWorkspace.directoryFor(props.hostId, props.threadId, path);
  return (state?.entries ?? []).map((entry) => ({
    ...entry,
    children: entry.type === "directory" ? childrenFor(entry.path) : undefined,
  }));
}

function refreshTree() {
  void fileWorkspace.refreshExpandedDirectories(props.hostId, props.threadId);
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
    <div v-else class="min-h-0 flex-1 overflow-hidden py-2">
      <TreeRoot
        data-testid="remote-file-tree-scroll"
        v-model="selected"
        v-model:expanded="expanded"
        :items="tree"
        :get-key="(node: FileTreeNode) => node.path"
        :get-children="(node: FileTreeNode) => node.children"
        class="relative h-full w-full min-w-0 list-none overflow-x-scroll overflow-y-auto outline-none"
      >
        <!--
          Reka virtualizes rows, so scrollWidth only reflects the currently rendered names.
          Keep the horizontal scrollbar geometry allocated: auto overflow can otherwise toggle
          when a long row enters/leaves the virtual range, changing clientHeight and feeding back
          into the vertical virtualizer. The estimate must also match the h-8 row height exactly.
        -->
        <TreeVirtualizer v-slot="{ item }" :estimate-size="32" :text-content="(node) => node.name">
          <RemoteFileTreeRow
            :node="fileTreeNode(item.value)"
            :level="item.level"
            @download="fileActions.downloadFile"
            @copy-path="fileActions.copyAbsolutePath"
            @delete="fileActions.requestDelete"
          />
        </TreeVirtualizer>
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
