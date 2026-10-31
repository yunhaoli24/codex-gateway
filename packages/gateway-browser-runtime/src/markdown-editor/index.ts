// Keep Milkdown and its ProseMirror instance together in the precompiled runtime. The composer
// loads this entry on mount; timeline Markdown rendering never loads an editable document.
import "@milkdown/kit/prose/view/style/prosemirror.css";
export {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
  parserCtx,
  schemaCtx,
} from "@milkdown/kit/core";
export { commonmark } from "@milkdown/kit/preset/commonmark";
export { gfm } from "@milkdown/kit/preset/gfm";
export { history } from "@milkdown/kit/plugin/history";
export { clipboard } from "@milkdown/kit/plugin/clipboard";
export { $node, $prose, replaceAll } from "@milkdown/kit/utils";
export { Plugin, TextSelection } from "@milkdown/kit/prose/state";
export type { EditorState, Transaction } from "@milkdown/kit/prose/state";
export type { EditorView } from "@milkdown/kit/prose/view";
export type { Node as ProseNode } from "@milkdown/kit/prose/model";
export { DOMParser } from "@milkdown/kit/prose/model";
export { markdownSchema, configureMarkdownSchema } from "./schema";
export { createMarkdownClipboard } from "./clipboard";
