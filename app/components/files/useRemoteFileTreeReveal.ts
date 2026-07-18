import { nextTick, ref, watch, type ComputedRef, type Ref } from "vue";
import type { RemoteDirectoryEntry } from "~~/shared/types";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";

interface FileTreeNode {
  path: string;
  type: RemoteDirectoryEntry["type"];
  children?: FileTreeNode[];
}

export function useRemoteFileTreeReveal(options: {
  hostId: () => number;
  threadId: () => string;
  rootPath: () => string;
  visible: () => boolean;
  activePath: ComputedRef<string | null>;
  tree: ComputedRef<FileTreeNode[]>;
  selected: Ref<FileTreeNode | undefined>;
  viewport: Readonly<Ref<HTMLElement | null>>;
}) {
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const revealSequence = ref(0);

  watch(
    () =>
      [
        options.hostId(),
        options.threadId(),
        options.rootPath(),
        options.activePath.value,
        options.visible(),
      ] as const,
    async ([hostId, threadId, rootPath, path, visible]) => {
      const sequence = ++revealSequence.value;
      if (!visible || !rootPath) return;
      if (!path) {
        options.selected.value = undefined;
        return;
      }

      // Files outside the conversation root remain valid preview documents. They deliberately do
      // not affect the tree because their ancestors cannot be represented beneath this TreeRoot.
      if (!(await fileWorkspace.revealFileInTree(hostId, threadId, path))) {
        if (sequence === revealSequence.value) options.selected.value = undefined;
        return;
      }
      await nextTick();
      if (sequence !== revealSequence.value) return;

      const node = findNode(options.tree.value, path);
      options.selected.value = node;
      await nextTick();
      if (!node || sequence !== revealSequence.value) return;

      // scrollIntoView delegates both axes to the native tree viewport. Using nearest avoids
      // disturbing the user's position when the selected row is already visible.
      const row = [
        ...(options.viewport.value?.querySelectorAll<HTMLElement>("[data-file-path]") ?? []),
      ].find((element) => element.dataset.filePath === path);
      row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    { immediate: true },
  );
}

function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = node.children ? findNode(node.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
}
