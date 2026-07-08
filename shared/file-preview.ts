const codeLikeExtensions = [
  "bash",
  "c",
  "cc",
  "cfg",
  "conf",
  "cpp",
  "css",
  "csv",
  "dockerfile",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "log",
  "mjs",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
] as const;

const markdownExtensions = ["md", "markdown"] as const;

const documentExtensions = [
  "doc",
  "docx",
  "gif",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "svg",
  "webp",
  "xls",
  "xlsx",
] as const;

const previewableExtensions: ReadonlySet<string> = new Set([
  ...codeLikeExtensions,
  ...markdownExtensions,
  ...documentExtensions,
]);

const textPreviewExtensions: ReadonlySet<string> = new Set([
  ...codeLikeExtensions,
  ...markdownExtensions,
]);

export function extensionFromPath(path: string) {
  return path.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase() || "";
}

export function isPreviewablePath(path: string) {
  return previewableExtensions.has(extensionFromPath(path));
}

export function isMarkdownPreviewPath(path: string, contentType = "") {
  const extension = extensionFromPath(path);
  return (
    markdownExtensions.includes(extension as (typeof markdownExtensions)[number]) ||
    contentType.includes("markdown")
  );
}

export function isTextPreviewPath(path: string, contentType = "") {
  if (contentType.startsWith("text/") || contentType.includes("json")) {
    return true;
  }
  return textPreviewExtensions.has(extensionFromPath(path));
}
