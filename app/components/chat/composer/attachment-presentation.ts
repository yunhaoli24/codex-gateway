import type { AttachmentData } from "@codex-gateway/ai-elements/attachments";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";

export interface ComposerAttachmentPresentation {
  id: string;
  data: AttachmentData;
}

export function presentComposerAttachment(
  attachment: ComposerAttachment,
  previewUrl = attachment.dataUrl ?? attachment.path,
): ComposerAttachmentPresentation {
  return {
    id: attachment.id,
    data: {
      id: attachment.id,
      type: "file",
      filename: attachment.name,
      mediaType:
        attachment.mimeType ?? (attachment.isImage ? "image/*" : "application/octet-stream"),
      url: previewUrl,
    },
  };
}
