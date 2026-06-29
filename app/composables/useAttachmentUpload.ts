import { ref, type Ref } from "vue";
import type { UploadedFileRecord } from "~~/shared/types";
import type { ComposerAttachment } from "@/composables/useComposerDraft";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";

export function useAttachmentUpload(
  selectedHostId: Ref<number | null>,
  attachedFiles: Ref<ComposerAttachment[]>,
) {
  const store = useGatewayStore();
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
    const images = files.filter((file) => file.type.startsWith("image/"));
    const otherFiles = files.filter((file) => !file.type.startsWith("image/"));

    for (const file of images) {
      attachedFiles.value.push({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`,
        name: file.name || "pasted-image.png",
        path: "",
        mimeType: file.type || null,
        size: file.size,
        isImage: true,
        dataUrl: await dataUrlFromFile(file),
      });
    }

    if (!otherFiles.length || !selectedHostId.value) {
      return;
    }

    const hostId = selectedHostId.value;
    uploadingAttachments.value = true;
    try {
      const form = new FormData();
      for (const file of otherFiles) {
        form.append("files", file, file.name);
      }
      const result = await $fetch<{ files: UploadedFileRecord[] }>("/api/uploads", {
        method: "POST",
        query: { hostId },
        body: form,
      });
      attachedFiles.value.push(
        ...result.files.map((file) => ({
          ...file,
          id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`,
        })),
      );
    } catch (error: any) {
      store.setError(
        messageFromError(error, t("app.uploadAttachmentFailed"), errorMessageLabels(t)),
        { hostId },
      );
    } finally {
      uploadingAttachments.value = false;
    }
  }

  function handleAttachmentChange(event: Event) {
    const input = event.target as HTMLInputElement;
    void addFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) {
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
