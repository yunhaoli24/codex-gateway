import {
  bundledLanguages,
  getSingletonHighlighter,
  type BundledLanguage,
  type Highlighter,
} from "shiki";

const SHIKI_THEME = "github-light";
const SHIKI_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "dockerfile",
  "go",
  "graphql",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "nginx",
  "php",
  "python",
  "ruby",
  "rust",
  "scss",
  "shell",
  "sql",
  "stylus",
  "tsx",
  "toml",
  "typescript",
  "vue",
  "xml",
  "yaml",
] as const satisfies readonly BundledLanguage[];

let highlighterPromise: Promise<Highlighter> | null = null;
const languageLoadPromises = new Map<string, Promise<void>>();

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
    "c++": "cpp",
    "c#": "csharp",
    bash: "shell",
    cc: "cpp",
    cjs: "javascript",
    cmd: "batch",
    cs: "csharp",
    cxx: "cpp",
    docker: "dockerfile",
    env: "dotenv",
    gyp: "python",
    h: "c",
    hh: "cpp",
    hpp: "cpp",
    htm: "html",
    java: "java",
    js: "javascript",
    jsonl: "json",
    md: "markdown",
    mdx: "markdown",
    mjs: "javascript",
    pb: "protobuf",
    pl: "perl",
    ps: "powershell",
    ps1: "powershell",
    py: "python",
    pyw: "python",
    rb: "ruby",
    rs: "rust",
    sh: "shell",
    shellscript: "shell",
    tf: "terraform",
    ts: "typescript",
    txt: "text",
    yml: "yaml",
    zsh: "shell",
  };
  const normalized = (value || "").trim().toLowerCase();
  return aliases[normalized] || normalized;
}

export async function highlightCode(value: string, language = "") {
  const normalizedLanguage = normalizeLanguage(language);
  if (!normalizedLanguage || normalizedLanguage === "text" || normalizedLanguage === "plain") {
    return escapeHtml(value);
  }
  if (!isBundledLanguage(normalizedLanguage)) {
    return escapeHtml(value);
  }
  const highlighter = await getCodeHighlighter();
  await ensureLanguageLoaded(highlighter, normalizedLanguage);
  return highlighter.codeToHtml(value, {
    lang: normalizedLanguage,
    theme: SHIKI_THEME,
    structure: "inline",
  });
}

export function languageFromPath(path: string) {
  const cleanPath = path.split("?")[0]?.split("#")[0] || "";
  const fileName = cleanPath.split("/").pop()?.toLowerCase() || "";
  const byFileName: Record<string, string> = {
    ".bashrc": "shell",
    ".env": "dotenv",
    ".eslintrc": "json",
    ".gitignore": "git-commit",
    ".npmrc": "ini",
    ".prettierrc": "json",
    ".zshrc": "shell",
    "cmakelists.txt": "cmake",
    dockerfile: "dockerfile",
    makefile: "makefile",
    "nginx.conf": "nginx",
  };
  if (byFileName[fileName]) {
    return byFileName[fileName];
  }
  const extension = cleanPath.split(".").pop()?.toLowerCase() || "";
  const byExtension: Record<string, string> = {
    bash: "shell",
    bat: "batch",
    c: "c",
    cc: "cpp",
    cfg: "ini",
    cjs: "javascript",
    cmake: "cmake",
    conf: "ini",
    cpp: "cpp",
    cs: "csharp",
    cxx: "cpp",
    css: "css",
    csv: "csv",
    dart: "dart",
    diff: "diff",
    dockerfile: "dockerfile",
    env: "dotenv",
    ex: "elixir",
    exs: "elixir",
    fs: "fsharp",
    go: "go",
    gql: "graphql",
    graphql: "graphql",
    h: "c",
    hpp: "cpp",
    html: "html",
    ini: "ini",
    java: "java",
    js: "javascript",
    json: "json",
    json5: "json5",
    jsonc: "jsonc",
    jsonl: "json",
    jsx: "javascript",
    kt: "kotlin",
    kts: "kotlin",
    less: "less",
    lua: "lua",
    m: "objective-c",
    md: "markdown",
    mdx: "markdown",
    mjs: "javascript",
    mm: "objective-cpp",
    nix: "nix",
    patch: "diff",
    pb: "protobuf",
    php: "php",
    pl: "perl",
    proto: "protobuf",
    ps1: "powershell",
    py: "python",
    pyw: "python",
    r: "r",
    rb: "ruby",
    rs: "rust",
    sass: "sass",
    scala: "scala",
    scss: "scss",
    sh: "shell",
    sql: "sql",
    styl: "stylus",
    stylus: "stylus",
    svelte: "svelte",
    swift: "swift",
    tf: "terraform",
    tfvars: "terraform",
    toml: "toml",
    ts: "typescript",
    tsx: "typescript",
    vue: "vue",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    zig: "zig",
    zsh: "shell",
  };
  return byExtension[extension] || "";
}

function isBundledLanguage(language: string): language is BundledLanguage {
  return language in bundledLanguages;
}

async function ensureLanguageLoaded(highlighter: Highlighter, language: BundledLanguage) {
  if (highlighter.getLoadedLanguages().includes(language)) {
    return;
  }
  const existing = languageLoadPromises.get(language);
  if (existing) {
    await existing;
    return;
  }
  const next = highlighter.loadLanguage(language).then(() => undefined);
  languageLoadPromises.set(language, next);
  try {
    await next;
  } finally {
    languageLoadPromises.delete(language);
  }
}
