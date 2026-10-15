<script setup lang="ts">
import {
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  Trash2Icon,
} from "@lucide/vue";
import { TreeItem } from "reka-ui";
import type { RemoteDirectoryEntry, RemoteGitFileStatus } from "~~/shared/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@codex-gateway/ui/context-menu";
import { useLongPressContextMenu } from "@/composables/interactions/useLongPressContextMenu";
import { gitStatusTextClass } from "@/utils/git-status-presentation";
import GitStatusBadge from "./git/GitStatusBadge.vue";

interface FileTreeNode {
  name: string;
  path: string;
  type: RemoteDirectoryEntry["type"];
  children?: FileTreeNode[];
}

defineProps<{
  node: FileTreeNode;
  level: number;
  gitStatus: RemoteGitFileStatus | null;
  descendantChangeCount: number;
}>();

const emit = defineEmits<{
  open: [path: string];
  download: [path: string];
  copyPath: [path: string];
  delete: [path: string];
}>();

const { longPressContextMenuHandlers } = useLongPressContextMenu({ menuWidthEstimate: 192 });

// Reka's select event also fires when activating the already selected row. Model updates alone
// miss that case after a timeline link reveals the file, leaving the mobile tree sheet open.
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child :disabled="node.type === 'other'">
      <TreeItem
        v-slot="{ isExpanded }"
        v-bind="node.type !== 'other' ? longPressContextMenuHandlers : {}"
        :value="node"
        :data-file-path="node.path"
        :level="level"
        @select="node.type === 'file' && emit('open', node.path)"
        class="flex h-8 w-max min-w-full cursor-default items-center gap-1.5 rounded-md pr-2 text-sm text-ink-muted outline-none hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/35 data-selected:bg-primary/10 data-selected:text-ink"
        :style="{ paddingInlineStart: `${Math.max(0, level - 1) * 1.125 + 0.5}rem` }"
      >
        <ChevronRightIcon
          v-if="node.type === 'directory'"
          class="size-3.5 shrink-0 transition-transform"
          :class="isExpanded ? 'rotate-90' : ''"
        />
        <span v-else class="w-3.5 shrink-0" />
        <FolderOpenIcon
          v-if="node.type === 'directory' && isExpanded"
          class="size-4 shrink-0 text-primary"
        />
        <FolderIcon v-else-if="node.type === 'directory'" class="size-4 shrink-0 text-primary" />
        <FileIcon v-else class="size-4 shrink-0 text-ink-faint" />
        <span
          class="whitespace-nowrap"
          :class="gitStatus ? gitStatusTextClass(gitStatus) : ''"
          :title="node.path"
        >
          {{ node.name }}
        </span>
        <GitStatusBadge v-if="gitStatus" class="ml-auto pl-3" :status="gitStatus" />
        <span
          v-else-if="descendantChangeCount > 0"
          class="ml-auto size-1.5 shrink-0 rounded-full bg-accent-orange"
          :aria-label="$t('app.fileGitDescendantChanges', { count: descendantChangeCount })"
        />
      </TreeItem>
    </ContextMenuTrigger>
    <ContextMenuContent
      v-if="node.type !== 'other'"
      :collision-padding="12"
      prioritize-position
      class="w-48"
    >
      <ContextMenuItem v-if="node.type === 'file'" @select="emit('download', node.path)">
        <DownloadIcon class="size-4" />
        {{ $t("app.downloadFile") }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('copyPath', node.path)">
        <CopyIcon class="size-4" />
        {{ $t("app.copyAbsolutePath") }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="node.type === 'file'"
        variant="destructive"
        @select="emit('delete', node.path)"
      >
        <Trash2Icon class="size-4" />
        {{ $t("app.deleteFile") }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
