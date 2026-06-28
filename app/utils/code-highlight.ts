import { getSingletonHighlighter, type BundledLanguage, type Highlighter } from "shiki";

const SHIKI_THEME = "github-light";
const SHIKI_LANGUAGES = [
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "scss",
  "shell",
  "stylus",
  "typescript",
  "vue",
  "xml",
  "yaml",
] as const satisfies readonly BundledLanguage[];

let highlighterPromise: Promise<Highlighter> | null = null;

export function getCodeHighlighter() {
  highlighterPromise ??= getSingletonHighlighter({
    langs: [...SHIKI_LANGUAGES],
    themes: [SHIKI_THEME],
  });
  return highlighterPromise;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

export function normalizeLanguage(value: string) {
  const aliases: Record<string, string> = {
    htm: "html",
    js: "javascript",
    md: "markdown",
    sh: "shell",
    ts: "typescript",
    yml: "yaml",
  };
  const normalized = (value || "").trim().toLowerCase();
  return aliases[normalized] || normalized;
}

export async function highlightCode(value: string, language = "") {
  const normalizedLanguage = normalizeLanguage(language);
  if (!normalizedLanguage) {
    return escapeHtml(value);
  }
  const highlighter = await getCodeHighlighter();
  if (!highlighter.getLoadedLanguages().includes(normalizedLanguage as BundledLanguage)) {
    return escapeHtml(value);
  }
  return highlighter.codeToHtml(value, {
    lang: normalizedLanguage as BundledLanguage,
    theme: SHIKI_THEME,
    structure: "inline",
  });
}

export function languageFromPath(path: string) {
  const extension = path.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase() || "";
  const byExtension: Record<string, string> = {
    bash: "shell",
    cjs: "javascript",
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    scss: "scss",
    sh: "shell",
    styl: "stylus",
    stylus: "stylus",
    ts: "typescript",
    tsx: "typescript",
    vue: "vue",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return byExtension[extension] || "";
}
