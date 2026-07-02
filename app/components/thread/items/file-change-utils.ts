export function fileChangePath(change: Record<string, any>) {
  return change.path || change.filePath || change.pathAfter || change.pathBefore || "unknown";
}

export function fileChangeKey(change: Record<string, any>) {
  return `${fileChangePath(change)}:${fileChangeKind(change)}`;
}

export function fileChangeKind(change: Record<string, any>) {
  const kind = change.kind;
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object") return kind.type || kind.kind || "update";
  return "update";
}

export function fileChangeDiff(change: Record<string, any>) {
  return change.diff || "";
}

export function fileChangeDiffMarkdown(change: Record<string, any>) {
  const diff = fileChangeDiff(change);
  return diff ? `\`\`\`diff\n${diff.replaceAll("```", "``\\`")}\n\`\`\`` : "";
}

export function fileChangeFollowKey(change: Record<string, any>) {
  return `${fileChangePath(change)}:${fileChangeDiff(change).length}`;
}
