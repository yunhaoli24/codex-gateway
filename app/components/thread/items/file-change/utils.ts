import type { ThreadFileChange } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import { firstNonEmptyString } from "~~/shared/utils/strings";

export function fileChangePath(change: ThreadFileChange) {
  return (
    firstNonEmptyString([change.path, change.filePath, change.pathAfter, change.pathBefore]) ??
    "unknown"
  );
}

export function fileChangeKey(change: ThreadFileChange) {
  return `${fileChangePath(change)}:${fileChangeKind(change)}`;
}

export function fileChangeTargetPath(change: ThreadFileChange) {
  const kind = fileChangeKind(change).toLowerCase();
  if (kind.includes("delete") || kind === "remove") return null;
  // Codex update patches keep the original path and carry the rename destination in move_path.
  // Preview the destination while leaving the official event and diff untouched.
  const details = recordFromUnknown(change.kind);
  const movePath = details?.move_path;
  return firstNonEmptyString([
    typeof movePath === "string" ? movePath : null,
    change.pathAfter,
    change.path,
    change.filePath,
  ]);
}

export function fileChangeKind(change: ThreadFileChange) {
  const kind = change.kind;
  if (typeof kind === "string") return kind;
  const kindRecord = recordFromUnknown(kind);
  if (kindRecord !== null) {
    if (typeof kindRecord.type === "string") return kindRecord.type;
    if (typeof kindRecord.kind === "string") return kindRecord.kind;
  }
  return "update";
}

export function fileChangeDiff(change: ThreadFileChange) {
  return change.diff ?? "";
}

export function fileChangeDiffMarkdown(change: ThreadFileChange) {
  const diff = fileChangeDiff(change);
  return diff === "" ? "" : `\`\`\`diff\n${diff.replaceAll("```", "``\\`")}\n\`\`\``;
}

export function fileChangeFollowKey(change: ThreadFileChange) {
  return `${fileChangePath(change)}:${fileChangeDiff(change).length}`;
}
