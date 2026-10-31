import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  editorViewCtx,
  serializerCtx,
  markdownSchema,
  configureMarkdownSchema,
  history,
  clipboard,
  $prose,
  Plugin,
  replaceAll,
  TextSelection,
  type EditorView,
} from "@codex-gateway/browser-runtime/markdown-editor";
import type { ComposerFileReference } from "@/stores/gateway/types";
import { fileReferenceNode, fileReferencePlugin } from "./file-references";

interface ComposerEditorOptions {
  root: HTMLElement;
  value: () => string;
  disabled: () => boolean;
  placeholder: () => string;
  references: () => ComposerFileReference[];
  onUpdate: (markdown: string, view: EditorView) => void;
  onSelection: (view: EditorView) => void;
  onKeydown: (event: KeyboardEvent, view: EditorView) => boolean;
  onPaste: (event: ClipboardEvent) => boolean;
}

export async function createMarkdownComposer(options: ComposerEditorOptions) {
  let syncing = false;
  let serialized = options.value();
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root);
      ctx.set(defaultValueCtx, options.value());
      configureMarkdownSchema(ctx);
      ctx.set(editorViewOptionsCtx, {
        editable: () => !options.disabled(),
        attributes: {
          "aria-label": options.placeholder(),
          placeholder: options.placeholder(),
          "aria-multiline": "true",
          "data-testid": "composer-input",
        },
        handleDOMEvents: { paste: (_view, event) => options.onPaste(event) },
        handleKeyDown: (view, event) => options.onKeydown(event, view),
      });
    })
    .use(markdownSchema)
    .use(history)
    .use(clipboard)
    .use(fileReferenceNode)
    .use(fileReferencePlugin(options.references))
    .use(
      $prose(
        (ctx) =>
          new Plugin({
            view: () => ({
              update: (view, previous) => {
                if (!view.state.doc.eq(previous.doc)) {
                  // Listener's markdownUpdated is debounced. Serialize synchronously here so pressing
                  // Send immediately after the last keystroke cannot submit an older draft.
                  serialized = ctx.get(serializerCtx)(view.state.doc).replace(/\n$/, "");
                  view.dom.dataset.value = serialized;
                  view.dom.dataset.empty = String(
                    view.state.doc.textContent === "" && view.state.doc.childCount === 1,
                  );
                  if (!syncing) options.onUpdate(serialized, view);
                }
                if (
                  !view.state.doc.eq(previous.doc) ||
                  !view.state.selection.eq(previous.selection)
                )
                  options.onSelection(view);
              },
            }),
          }),
      ),
    );
  await editor.create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  view.dom.dataset.value = options.value();
  view.dom.dataset.empty = String(view.state.doc.textContent === "");
  view.dispatch(view.state.tr.setMeta("referencesChanged", true));

  return {
    view,
    setMarkdown(value: string) {
      if (value === serialized) return;
      syncing = true;
      try {
        editor.action(replaceAll(value));
        serialized = value;
        view.dom.dataset.value = value;
      } finally {
        syncing = false;
      }
    },
    refresh() {
      view.setProps({
        editable: () => !options.disabled(),
        attributes: {
          "data-testid": "composer-input",
          "aria-multiline": "true",
          "aria-label": options.placeholder(),
          placeholder: options.placeholder(),
        },
      });
      view.dispatch(view.state.tr.setMeta("referencesChanged", true));
    },
    insertReference(reference: ComposerFileReference, from: number) {
      editor.action((ctx) => {
        const tr = view.state.tr.replaceWith(
          from,
          view.state.selection.to,
          fileReferenceNode.type(ctx).create(reference),
        );
        tr.setSelection(TextSelection.create(tr.doc, from + 1));
        view.dispatch(tr.insertText(" ").scrollIntoView());
      });
      view.focus();
    },
    destroy: () => editor.destroy(),
  };
}

export type MarkdownComposer = Awaited<ReturnType<typeof createMarkdownComposer>>;
