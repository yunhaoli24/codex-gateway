<script setup lang="ts">
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "@lucide/vue";
import { TreeItem, TreeRoot, TreeVirtualizer } from "reka-ui";
import { computed, ref, watch } from "vue";
import type { RemoteDirectoryEntry } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { useGatewayFileWorkspaceStore } from "@/stores/gateway-file-workspace";

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
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-canvas-soft/45" data-testid="remote-file-tree">
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
    <div v-else class="min-h-0 flex-1 py-2">
      <TreeRoot
        v-model="selected"
        v-model:expanded="expanded"
        :items="tree"
        :get-key="(node: FileTreeNode) => node.path"
        :get-children="(node: FileTreeNode) => node.children"
        class="relative h-full min-w-max list-none overflow-auto outline-none"
      >
        <TreeVirtualizer v-slot="{ item }" :estimate-size="30" :text-content="(node) => node.name">
          <TreeItem
            v-slot="{ isExpanded }"
            :value="item.value"
            :level="item.level"
            class="flex h-8 min-w-full cursor-default items-center gap-1.5 rounded-md pr-2 text-sm text-ink-muted outline-none hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/35 data-selected:bg-primary/10 data-selected:text-ink"
            :style="{ paddingInlineStart: `${Math.max(0, item.level - 1) * 1.125 + 0.5}rem` }"
          >
            <ChevronRightIcon
              v-if="item.value.type === 'directory'"
              class="size-3.5 shrink-0 transition-transform"
              :class="isExpanded ? 'rotate-90' : ''"
            />
            <span v-else class="w-3.5 shrink-0" />
            <FolderOpenIcon
              v-if="item.value.type === 'directory' && isExpanded"
              class="size-4 shrink-0 text-primary"
            />
            <FolderIcon
              v-else-if="item.value.type === 'directory'"
              class="size-4 shrink-0 text-primary"
            />
            <FileIcon v-else class="size-4 shrink-0 text-ink-faint" />
            <span class="truncate" :title="item.value.path">{{ item.value.name }}</span>
          </TreeItem>
        </TreeVirtualizer>
      </TreeRoot>
    </div>
  </section>
</template>
