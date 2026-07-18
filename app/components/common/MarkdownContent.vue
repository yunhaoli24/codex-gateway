<script setup lang="ts">
import { katex } from "@mdit/plugin-katex";
import MarkdownIt from "markdown-it";
import { useEventListener } from "@vueuse/core";
import { ref, watch } from "vue";
import { parseRemoteFileLink } from "@/utils/file-preview-links";
import { escapeHtml, highlightCode, normalizeLanguage } from "@/utils/code-highlight";
import { useFilePreviewContext } from "@/composables/files/useFilePreviewContext";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";

const props = withDefaults(
  defineProps<{
    content: string;
    compact?: boolean;
    diffLanguage?: string;
  }>(),
  {
    compact: false,
    diffLanguage: "",
  },
);

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

markdown.use(katex, {
  delimiters: "all",
  throwOnError: false,
  strict: false,
  trust: false,
});

markdown.renderer.rules.fence = (tokens, index) => {
  const highlightedHtml = tokens[index]?.meta?.highlightedHtml;
  return typeof highlightedHtml === "string" ? highlightedHtml : "";
};

const rendered = ref("");
const root = ref<HTMLElement | null>(null);
const filePreviewContext = useFilePreviewContext();
const fileWorkspace = useGatewayFileWorkspaceStore();
let renderVersion = 0;

watch(
  () => [props.content, props.diffLanguage] as const,
  async () => {
    const currentVersion = renderVersion + 1;
    renderVersion = currentVersion;
    const nextRendered = await renderMarkdown(props.content || "");
    if (renderVersion === currentVersion) {
      rendered.value = nextRendered;
    }
  },
  { immediate: true },
);

async function renderMarkdown(content: string) {
  const tokens = markdown.parse(content, {});
  for (const token of tokens) {
    if (token.type !== "fence") {
      continue;
    }
    const normalizedLanguage = normalizeLanguage(token.info);
    if (normalizedLanguage === "diff") {
      token.meta = {
        ...token.meta,
        highlightedHtml: `<pre class="syntax-highlight language-diff"><code>${await renderDiff(token.content, props.diffLanguage)}</code></pre>`,
      };
    } else {
      token.meta = {
        ...token.meta,
        highlightedHtml: `<pre class="shiki-block syntax-highlight language-${normalizeLanguage(normalizedLanguage || "text")}"><code>${await highlightCode(token.content, normalizedLanguage)}</code></pre>`,
      };
    }
  }
  return markdown.renderer.render(tokens, markdown.options, {});
}

async function renderDiff(value: string, language: string) {
  const normalizedLanguage = normalizeLanguage(language);
  const lines = await Promise.all(
    value.split("\n").map(async (line) => {
      const className = diffLineClass(line);
      return `<span class="${className}">${await renderDiffLine(line, normalizedLanguage)}</span>`;
    }),
  );
  return lines.join("");
}

function diffCodeLine(line: string) {
  const marker = line[0];
  return marker === "+" || marker === "-" || marker === " " ? line.slice(1) : line;
}

async function renderDiffLine(line: string, language: string) {
  if (!line) {
    return " ";
  }
  if (
    line.startsWith("@@") ||
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("+++") ||
    line.startsWith("---")
  ) {
    return escapeHtml(line);
  }
  const marker = line[0];
  if (marker !== "+" && marker !== "-" && marker !== " ") {
    return highlightCode(line, language);
  }
  const code = diffCodeLine(line);
  return `<span class="diff-line-marker">${escapeHtml(marker)}</span>${await highlightCode(code || " ", language)}`;
}

function diffLineClass(line: string) {
  if (line.startsWith("@@")) {
    return "diff-line diff-line-hunk";
  }
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("+++") ||
    line.startsWith("---")
  ) {
    return "diff-line diff-line-meta";
  }
  if (line.startsWith("+")) {
    return "diff-line diff-line-add";
  }
  if (line.startsWith("-")) {
    return "diff-line diff-line-remove";
  }
  return "diff-line";
}

function handleClick(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || !filePreviewContext) {
    return;
  }
  const target = parseRemoteFileLink(anchor.href, window.location.href);
  if (!target) {
    return;
  }
  const hostId = filePreviewContext.hostId.value;
  const threadId = filePreviewContext.threadId.value;
  if (!hostId || !threadId) {
    return;
  }
  event.preventDefault();
  void fileWorkspace.openFile({
    hostId,
    projectId: filePreviewContext.projectId.value,
    threadId,
    path: target.path,
    line: target.line,
  });
}

useEventListener(root, "click", handleClick);
</script>

<template>
  <div
    ref="root"
    class="markdown-content"
    :class="{ 'markdown-content-compact': compact }"
    v-html="rendered"
  />
</template>
