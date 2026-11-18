import { basename } from "pathe";
import { nanoid } from "nanoid";
import { recordFromUnknown } from "~~/shared/utils/records";
import type { ThreadHistoryItem } from "~~/shared/types";
import type { ComposerDraft } from "@/stores/gateway/types";
import { threadItemText } from "@/utils/thread-items";

/** Reject inputs the composer cannot resend instead of silently changing a message when its
 * original Turn is excluded from the fork. These remain readable in the original conversation. */
export function canRestoreUserMessage(item: ThreadHistoryItem) {
  return (item.content ?? []).every((value) => {
    const part = recordFromUnknown(value);
    return (
      part?.type === "text" ||
      (part?.type === "localImage" && typeof part.path === "string") ||
      (part?.type === "image" && typeof part.url === "string")
    );
  });
}

/** Fork stays on the same host, so official localImage paths can be reused without re-uploading. */
export function draftFromUserMessage(item: ThreadHistoryItem): ComposerDraft {
  const attachedFiles: ComposerDraft["attachedFiles"] = [];
  for (const value of item.content ?? []) {
    const part = recordFromUnknown(value);
    if (part?.type === "localImage" && typeof part.path === "string") {
      attachedFiles.push({
        id: nanoid(),
        name: basename(part.path),
        path: part.path,
        size: 0,
        isImage: true,
      });
    } else if (part?.type === "image" && typeof part.url === "string") {
      attachedFiles.push({
        id: nanoid(),
        name: "image",
        path: "",
        size: 0,
        isImage: true,
        dataUrl: part.url,
      });
    }
  }
  return { text: threadItemText(item), attachedFiles, fileReferences: [] };
}
