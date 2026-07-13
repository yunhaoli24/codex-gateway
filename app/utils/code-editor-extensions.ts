import type { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { vue } from "@codemirror/lang-vue";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
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
  | "vue"
  | "cpp"
  | "java"
  | "python"
  | "rust"
  | "sql"
  | "yaml";

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
    cpp: cpp(),
    java: java(),
    python: python(),
    rust: rust(),
    sql: sql(),
    yaml: yaml(),
  };
  return extensions[language];
}

const languageByExtension: Record<string, CodeEditorLanguage> = {
  c: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  css: "css",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  pyw: "python",
  rs: "rust",
  sql: "sql",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  vue: "vue",
  yaml: "yaml",
  yml: "yaml",
};

export function codeEditorLanguageForPath(path: string): CodeEditorLanguage {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile" || name === "makefile") return "text";
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  return languageByExtension[extension] ?? "text";
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
