import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { toast } from "@codex-gateway/ui/sonner";
import ensureError from "ensure-error";
import { z } from "zod";
import type { WorkspaceUploadResult } from "~~/shared/types";
import { gatewayUpload } from "@/utils/gateway-api";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";

const resultSchema = z.object({
  files: z.array(
    z.union([
      z.object({ name: z.string(), path: z.string() }),
      z.object({
        name: z.string(),
        error: z.enum(["remoteFileAlreadyExists", "remoteFileUploadFailed"]),
      }),
    ]),
  ),
}) satisfies z.ZodType<WorkspaceUploadResult>;

export interface WorkspaceFileUploadState {
  phase: "uploading" | "saving" | "complete" | "failed";
  destination: string;
  files: Array<{
    name: string;
    size: number;
    status: "pending" | "success" | "error";
    error: string | null;
  }>;
  loaded: number;
  total: number | null;
  error: string | null;
}

export function useWorkspaceFileUpload(options: {
  hostId: MaybeRefOrGetter<number>;
  threadId: MaybeRefOrGetter<string>;
  rootPath: MaybeRefOrGetter<string>;
}) {
  const { t } = useI18n();
  const workspace = useGatewayFileWorkspaceStore();
  const input = ref<HTMLInputElement>();
  const state = ref<WorkspaceFileUploadState | null>(null);
  const progressOpen = ref(false);
  const uploading = computed(
    () => state.value?.phase === "uploading" || state.value?.phase === "saving",
  );
  let controller: AbortController | undefined;
  let pickerDestination = "";

  function reset() {
    controller?.abort();
    state.value = null;
    progressOpen.value = false;
  }
  watch(
    () => [toValue(options.hostId), toValue(options.threadId), toValue(options.rootPath)],
    reset,
    { flush: "sync" },
  );
  onScopeDispose(reset);

  function openPicker(path: string) {
    if (uploading.value) return;
    pickerDestination = path;
    input.value?.click();
  }

  function picked(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    void upload(Array.from(target.files ?? []), pickerDestination);
    target.value = "";
  }

  async function upload(files: File[], path: string) {
    if (uploading.value || files.length === 0 || path === "") return;
    if (files.some((file) => Boolean(file.webkitRelativePath))) {
      toast.error(t("app.uploadFilesOnly"));
      return;
    }
    const hostId = toValue(options.hostId);
    const threadId = toValue(options.threadId);
    const rootPath = toValue(options.rootPath);
    const sessionIsCurrent = captureSessionEpoch();
    const isCurrent = () =>
      sessionIsCurrent() &&
      hostId === toValue(options.hostId) &&
      threadId === toValue(options.threadId) &&
      rootPath === toValue(options.rootPath);
    controller = new AbortController();
    state.value = {
      phase: "uploading",
      destination: path,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        status: "pending",
        error: null,
      })),
      loaded: 0,
      total: null,
      error: null,
    };
    const task = state.value;
    progressOpen.value = true;
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file, file.name);
      const query = new URLSearchParams({ hostId: String(hostId), rootPath, path });
      const result = resultSchema.parse(
        await gatewayUpload(`/api/remote/uploads?${query}`, {
          body: form,
          signal: controller.signal,
          onProgress: (loaded, total) => {
            task.loaded = loaded;
            task.total = total;
          },
          onUploaded: () => {
            task.phase = "saving";
          },
        }),
      );
      if (!isCurrent()) return;
      task.phase = "complete";
      for (const [index, file] of result.files.entries()) {
        const entry = task.files[index];
        if (!entry) continue;
        entry.status = "error" in file ? "error" : "success";
        entry.error = "error" in file ? t(`app.${file.error}`) : null;
      }
      workspace.markRemoteFilesChanged(
        hostId,
        threadId,
        result.files
          .filter((file) => !("error" in file))
          .map((file) => `${path.replace(/\/$/, "")}/${file.name}`),
      );
      const scope = workspace.scopeFor(hostId, threadId);
      if (scope && result.files.some((file) => !("error" in file))) {
        await workspace.setExpandedPaths(hostId, threadId, [
          ...new Set([...scope.expandedPaths, path]),
        ]);
      }
      await workspace.loadDirectory(hostId, threadId, path, true);
    } catch (error) {
      if (!isCurrent() || state.value !== task) return;
      if (task.phase === "complete") {
        toast.error(ensureError(error).message);
        return;
      }
      task.phase = "failed";
      task.error = ensureError(error).message;
      for (const file of task.files) {
        file.status = "error";
        file.error = t("app.remoteFileUploadFailed");
      }
    }
  }

  return { input, uploading, state, progressOpen, openPicker, picked, upload };
}
