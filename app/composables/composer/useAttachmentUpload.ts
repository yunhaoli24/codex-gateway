import { ref, type Ref } from "vue";
import { nanoid } from "nanoid";
import { gatewayApi } from "@/utils/gateway-api";
import type { UploadedFileRecord } from "~~/shared/types";
import type { ComposerAttachment } from "./useComposerDraft";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";

export function useAttachmentUpload(
  selectedHostId: Ref<number | null>,
  attachedFiles: Ref<ComposerAttachment[]>,
) {
  const store = useGatewayBootstrapStore();
  const { t } = useI18n();
  const uploadInputRef = ref<HTMLInputElement | null>(null);
  const uploadingAttachments = ref(false);

  function openAttachmentPicker() {
    uploadInputRef.value?.click();
  }

  async function dataUrlFromFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () =>
        resolve(typeof reader.result === "string" ? reader.result : ""),
      );
      reader.addEventListener("error", () =>
        reject(reader.error || new Error("Failed to read file")),
      );
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: File[]) {
    const sessionIsCurrent = captureSessionEpoch();
    const images = files.filter((file) => file.type.startsWith("image/"));
    const otherFiles = files.filter((file) => !file.type.startsWith("image/"));

    for (const file of images) {
      const dataUrl = await dataUrlFromFile(file);
      if (!sessionIsCurrent()) return;
      attachedFiles.value.push({
        id: nanoid(),
        name: file.name || "pasted-image.png",
        path: "",
        mimeType: file.type || null,
        size: file.size,
        isImage: true,
        dataUrl,
      });
    }

    if (otherFiles.length === 0 || selectedHostId.value === null) {
      return;
    }

    const hostId = selectedHostId.value;
    uploadingAttachments.value = true;
    try {
      const form = new FormData();
      for (const file of otherFiles) {
        form.append("files", file, file.name);
      }
      const result = await gatewayApi<{ files: UploadedFileRecord[] }>("/api/uploads", {
        method: "POST",
        query: { hostId },
        body: form,
      });
      if (!sessionIsCurrent() || selectedHostId.value !== hostId) return;
      attachedFiles.value.push(
        ...result.files.map((file) => ({
          ...file,
          id: nanoid(),
        })),
      );
    } catch (error: unknown) {
      if (!sessionIsCurrent()) return;
      store.setError(
        messageFromError(error, t("app.uploadAttachmentFailed"), errorMessageLabels(t)),
        { hostId },
      );
    } finally {
      if (sessionIsCurrent()) uploadingAttachments.value = false;
    }
  }

  function handleAttachmentChange(event: Event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    void addFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    void addFiles(files);
  }

  function removeAttachment(id: string) {
    attachedFiles.value = attachedFiles.value.filter((file) => file.id !== id);
  }

  return {
    uploadInputRef,
    uploadingAttachments,
    openAttachmentPicker,
    handleAttachmentChange,
    handlePaste,
    removeAttachment,
  };
}
