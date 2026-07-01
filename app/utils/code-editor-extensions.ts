import type { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { vue } from "@codemirror/lang-vue";
import { tags } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";

export type CodeEditorLanguage =
  | "text"
  | "json"
  | "javascript"
  | "typescript"
  | "html"
  | "css"
  | "markdown"
  | "vue";

export function languageExtension(language: CodeEditorLanguage): Extension {
  const extensions: Record<CodeEditorLanguage, Extension> = {
    text: [],
    json: json(),
    javascript: javascript(),
    typescript: javascript({ typescript: true }),
    html: html(),
    css: css(),
    markdown: markdown(),
    vue: vue({ base: html() }),
  };
  return extensions[language];
}

export const gatewayCodeEditorTheme = [
  EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
      fontSize: "0.875rem",
    },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace',
      lineHeight: "1.5rem",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "0.75rem",
      caretColor: "var(--ink)",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--canvas-soft)",
      color: "var(--ink-faint)",
      borderRight: "1px solid var(--hairline)",
    },
    ".cm-activeLineGutter, .cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--primary) 7%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--primary) 20%, transparent)",
    },
    "&.cm-focused": {
      outline: "2px solid color-mix(in srgb, var(--ring) 30%, transparent)",
      outlineOffset: "-1px",
    },
    ".cm-placeholder": {
      color: "var(--ink-faint)",
    },
  }),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: "var(--accent-purple-deep)" },
      { tag: [tags.string, tags.special(tags.string)], color: "var(--accent-teal)" },
      { tag: [tags.number, tags.bool, tags.null], color: "var(--accent-orange)" },
      { tag: [tags.propertyName, tags.attributeName], color: "var(--primary)" },
      { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--ink-faint)" },
      { tag: [tags.operator, tags.punctuation], color: "var(--ink-muted)" },
      { tag: tags.variableName, color: "var(--ink-secondary)" },
      { tag: tags.function(tags.variableName), color: "var(--accent-sky)" },
      { tag: [tags.tagName, tags.heading], color: "var(--accent-orange-deep)" },
    ]),
  ),
];
