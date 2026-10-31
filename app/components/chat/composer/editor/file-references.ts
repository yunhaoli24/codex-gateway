import { $node, $prose, Plugin } from "@codex-gateway/browser-runtime/markdown-editor";
import type { ComposerFileReference } from "@/stores/gateway/types";
import { z } from "zod";

const referenceAttributes = z.object({ id: z.string(), path: z.string(), name: z.string() });

// An inline atom gives ProseMirror ownership of selection, undo and deletion. A visual widget
// hiding ordinary text would leave the DOM selection and Markdown source at different offsets.
export const fileReferenceNode = $node("file_reference", () => ({
  inline: true,
  group: "inline",
  atom: true,
  attrs: { id: {}, path: {}, name: {} },
  toDOM: (node) => {
    const reference = referenceAttributes.parse(node.attrs);
    return [
      "span",
      {
        class: "composer-file-reference",
        "data-file-reference": reference.path,
        "data-reference-id": reference.id,
      },
      `@${reference.name}`,
    ];
  },
  parseDOM: [
    {
      tag: "span[data-file-reference]",
      getAttrs: (element) => ({
        id: element.getAttribute("data-reference-id") ?? element.dataset.fileReference ?? "",
        path: element.dataset.fileReference ?? "",
        name: (element.textContent ?? "").replace(/^@/, ""),
      }),
    },
  ],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node) => node.type.name === "file_reference",
    runner: (state, node) => {
      // References are opaque prompt text, not Markdown emphasis: filenames containing '_' or
      // '*' must retain the exact @path that the structured reference points to.
      state.addNode("html", undefined, `@${referenceAttributes.parse(node.attrs).path}`);
    },
  },
}));

export function fileReferencePlugin(references: () => ComposerFileReference[]) {
  return $prose(
    (ctx) =>
      new Plugin({
        appendTransaction: (transactions, _previous, state) => {
          if (!transactions.some((tr) => tr.docChanged || tr.getMeta("referencesChanged") === true))
            return null;
          const replacements: Array<{
            from: number;
            to: number;
            reference: ComposerFileReference;
          }> = [];
          state.doc.descendants((node, position, parent) => {
            if (
              !node.isText ||
              node.text === undefined ||
              node.text.length === 0 ||
              parent?.type.spec.code === true
            )
              return;
            for (const reference of references().toSorted(
              (a, b) => b.path.length - a.path.length,
            )) {
              const literal = `@${reference.path}`;
              let from = node.text.indexOf(literal);
              while (from >= 0) {
                const start = position + from;
                const end = start + literal.length;
                if (
                  !replacements.some(
                    (replacement) => start < replacement.to && end > replacement.from,
                  )
                )
                  replacements.push({ from: start, to: end, reference });
                from = node.text.indexOf(literal, from + literal.length);
              }
            }
          });
          if (!replacements.length) return null;
          const transaction = state.tr;
          for (const replacement of replacements.sort((a, b) => b.from - a.from)) {
            transaction.replaceWith(
              replacement.from,
              replacement.to,
              fileReferenceNode.type(ctx).create(replacement.reference),
            );
          }
          return transaction;
        },
        props: {
          handleKeyDown: (view, event) => {
            const { selection } = view.state;
            const before = selection.$from.nodeBefore;
            if (
              event.key !== "Backspace" ||
              !selection.empty ||
              before?.type.name !== "file_reference"
            )
              return false;
            view.dispatch(view.state.tr.delete(selection.from - before.nodeSize, selection.from));
            return true;
          },
        },
      }),
  );
}
