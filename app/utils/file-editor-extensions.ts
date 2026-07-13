import {
  autocompletion,
  completeAnyWord,
  completeFromList,
  snippetCompletion,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

const commonSnippets = [
  snippetCompletion("if (${condition}) {\n\t${}\n}", { label: "if", type: "keyword" }),
  snippetCompletion("for (const ${item} of ${items}) {\n\t${}\n}", {
    label: "forof",
    type: "keyword",
  }),
  snippetCompletion("function ${name}(${}) {\n\t${}\n}", { label: "function", type: "function" }),
];

export const fileEditorExtensions: Extension[] = [
  autocompletion({
    activateOnTyping: true,
    override: [completeAnyWord, completeFromList(commonSnippets)],
  }),
];
