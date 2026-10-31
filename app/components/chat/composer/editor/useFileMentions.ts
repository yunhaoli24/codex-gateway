import { useDebounceFn } from "@vueuse/core";
import { onScopeDispose, ref, type ShallowRef } from "vue";
import type { EditorView } from "@codex-gateway/browser-runtime/markdown-editor";
import type { FileReference } from "~~/shared/types";
import type { ComposerFileReference } from "@/stores/gateway/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { expectProjectFileSearchResults } from "@/stores/gateway-realtime/response-parsers";
import { createUuid } from "@/lib/uuid";
import type { MarkdownComposer } from "./create-markdown-composer";

interface MentionOptions {
  hostId: number | null;
  cwd: string | null;
  disabled: boolean;
  references: ComposerFileReference[];
}

export function useFileMentions(
  options: MentionOptions,
  editor: ShallowRef<MarkdownComposer | null>,
  updateReferences: (value: ComposerFileReference[]) => void,
  onLimit: () => void,
) {
  const realtime = useGatewayRealtimeStore();
  const cancellationToken = `composer-files-${createUuid()}`;
  const open = ref(false);
  const query = ref("");
  const files = ref<FileReference[]>([]);
  const selectedIndex = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let queryFrom = 0;
  let generation = 0;

  function dismiss() {
    open.value = false;
    files.value = [];
    error.value = null;
    loading.value = false;
    generation += 1;
    return true;
  }
  onScopeDispose(dismiss);

  const search = useDebounceFn(async () => {
    const { hostId, cwd } = options;
    if (!open.value || hostId === null || cwd === null) return;
    const current = generation;
    loading.value = true;
    error.value = null;
    try {
      const response = await realtime.request(
        (requestId) => ({
          type: "file.search",
          requestId,
          hostId,
          cwd,
          query: query.value,
          cancellationToken,
        }),
        expectProjectFileSearchResults,
      );
      if (current !== generation || !open.value) return;
      files.value = response.result.files;
      selectedIndex.value = 0;
    } catch (cause) {
      if (current !== generation) return;
      files.value = [];
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (current === generation) loading.value = false;
    }
  }, 100);

  function update(view: EditorView) {
    const { $from, empty } = view.state.selection;
    if (
      options.disabled ||
      options.cwd === null ||
      !empty ||
      $from.parent.type.spec.code === true
    ) {
      dismiss();
      return;
    }
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", " ");
    const match = /(?:^|\s)@([^\s@]*)$/u.exec(before);
    if (!match) {
      dismiss();
      return;
    }
    const nextQuery = match[1] ?? "";
    const nextFrom = $from.pos - nextQuery.length - 1;
    if (open.value && query.value === nextQuery && queryFrom === nextFrom) return;
    query.value = nextQuery;
    queryFrom = nextFrom;
    open.value = true;
    selectedIndex.value = 0;
    generation += 1;
    void search();
  }

  function select(file: FileReference) {
    if (!editor.value) return;
    const existing = options.references.find((reference) => reference.path === file.path);
    if (!existing && options.references.length >= 10) {
      onLimit();
      return;
    }
    const reference = existing ?? { ...file, id: createUuid() };
    if (!existing) updateReferences([...options.references, reference]);
    editor.value.insertReference(reference, queryFrom);
    dismiss();
  }

  function keydown(event: KeyboardEvent) {
    if (!open.value || event.isComposing) return false;
    if (event.key === "Escape") return dismiss();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (files.value.length > 0) {
        selectedIndex.value =
          (selectedIndex.value + (event.key === "ArrowDown" ? 1 : -1) + files.value.length) %
          files.value.length;
      }
      return true;
    }
    if (event.key !== "Enter") return false;
    const file = files.value[selectedIndex.value];
    if (file) select(file);
    return true;
  }
  return { open, query, files, selectedIndex, loading, error, update, select, keydown };
}
