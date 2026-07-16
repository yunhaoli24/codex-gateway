import { useClipboard } from "@vueuse/core";
import { ref, toValue, type MaybeRefOrGetter } from "vue";
import { toast } from "vue-sonner";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import { downloadRemoteFile } from "@/utils/remote-file-transport";

export function useRemoteFileTreeActions(options: {
  hostId: MaybeRefOrGetter<number>;
  threadId: MaybeRefOrGetter<string>;
}) {
  const { t } = useI18n();
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const { copy } = useClipboard();
  const pendingDeletePath = ref<string | null>(null);
  const deleting = ref(false);

  async function copyAbsolutePath(path: string) {
    try {
      await copy(path);
      toast.success(t("app.absolutePathCopied"));
    } catch (error) {
      toast.error(t("app.copyAbsolutePathFailed"), { description: errorMessage(error) });
    }
  }

  async function downloadFile(path: string) {
    try {
      const blob = await downloadRemoteFile(toValue(options.hostId), path);
      saveBlob(blob, fileName(path));
    } catch (error) {
      toast.error(t("app.downloadFileFailed"), { description: errorMessage(error) });
    }
  }

  function requestDelete(path: string) {
    pendingDeletePath.value = path;
  }

  function cancelDelete() {
    if (!deleting.value) pendingDeletePath.value = null;
  }

  async function confirmDelete() {
    const path = pendingDeletePath.value;
    if (!path || deleting.value) return;
    deleting.value = true;
    try {
      await fileWorkspace.deleteFile(toValue(options.hostId), toValue(options.threadId), path);
      pendingDeletePath.value = null;
      toast.success(t("app.fileDeleteSucceeded"));
    } catch (error) {
      toast.error(t("app.deleteFileFailed"), { description: errorMessage(error) });
    } finally {
      deleting.value = false;
    }
  }

  return {
    pendingDeletePath,
    deleting,
    copyAbsolutePath,
    downloadFile,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() || "download";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
