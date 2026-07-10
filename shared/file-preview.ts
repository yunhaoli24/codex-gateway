const markdownExtensions = ["md", "markdown"] as const;

const dedicatedDocumentExtensions: ReadonlySet<string> = new Set([
  "avif",
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
]);

export function extensionFromPath(path: string) {
  return path.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase() || "";
}

export function isDedicatedDocumentPreviewPath(path: string) {
  return dedicatedDocumentExtensions.has(extensionFromPath(path));
}

export function isMarkdownPreviewPath(path: string, contentType = "") {
  const extension = extensionFromPath(path);
  return (
    markdownExtensions.includes(extension as (typeof markdownExtensions)[number]) ||
    contentType.includes("markdown")
  );
}
