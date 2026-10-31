import { commonmark, codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { $node, $remark } from "@milkdown/kit/utils";
import remarkMath from "remark-math";
import type { Ctx } from "@milkdown/kit/ctx";

const mathSyntax = $remark("gatewayMath", () => remarkMath);

function mathNode(block: boolean) {
  const name = block ? "math_block" : "math_inline";
  return $node(name, () => ({
    group: block ? "block" : "inline",
    inline: !block,
    content: "text*",
    marks: "",
    code: true,
    toDOM: () => [block ? "div" : "span", { "data-math": block ? "block" : "inline" }, 0],
    parseDOM: [{ tag: `[data-math="${block ? "block" : "inline"}"]` }],
    parseMarkdown: {
      match: (node) => node.type === (block ? "math" : "inlineMath"),
      runner: (state, node, type) => {
        state.openNode(type);
        if (typeof node.value === "string") state.addText(node.value);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === name,
      runner: (state, node) =>
        state.addNode(block ? "math" : "inlineMath", undefined, node.textContent),
    },
  }));
}

// One schema is shared by editing and selected-DOM serialization. The read-only renderer
// remains markdown-it, including KaTeX/Shiki. Keep math as editable LaTeX here rather than
// round-tripping KaTeX's generated accessibility/layout spans into the user's prompt.
export const markdownSchema = [commonmark, gfm, mathSyntax, mathNode(false), mathNode(true)].flat();

// markdown-it/Shiki annotate fenced code with language classes; Milkdown annotates it with
// data-language. Accept both at this boundary so selection copy preserves the fence language.
export function configureMarkdownSchema(ctx: Ctx) {
  ctx.update(codeBlockSchema.key, (previous) => (ctx) => ({
    ...previous(ctx),
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (dom) => ({
          language:
            dom.dataset.language ??
            Array.from(dom.querySelector("code")?.classList ?? dom.classList)
              .find((name) => name.startsWith("language-"))
              ?.slice("language-".length) ??
            "",
        }),
      },
    ],
  }));
}
