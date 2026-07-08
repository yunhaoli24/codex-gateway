import type { InjectionKey, Ref } from "vue";
import { inject, provide } from "vue";

export interface FilePreviewContext {
  hostId: Ref<number | null>;
  projectId: Ref<number | null>;
  threadId: Ref<string | null>;
}

const filePreviewContextKey: InjectionKey<FilePreviewContext> = Symbol("file-preview-context");

export function provideFilePreviewContext(context: FilePreviewContext) {
  provide(filePreviewContextKey, context);
}

export function useFilePreviewContext() {
  return inject(filePreviewContextKey, null);
}
