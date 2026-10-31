type MarkdownConverter = (fragment: HTMLElement) => string;
let loading: Promise<MarkdownConverter> | undefined;

export function loadMarkdownClipboard() {
  // Cache only the schema and serializer. Copy operations do not cache selected documents.
  loading ??= import("@codex-gateway/browser-runtime/markdown-editor")
    .then((runtime) => runtime.createMarkdownClipboard())
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
