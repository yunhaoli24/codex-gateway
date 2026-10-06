import { katex } from "@mdit/plugin-katex";
import "katex/dist/katex.min.css";
import MarkdownIt from "markdown-it";

export interface MarkdownCodeFence {
  content: string;
  language: string;
}

export type MarkdownCodeFenceRenderer = (fence: MarkdownCodeFence) => Promise<string | undefined>;

export interface MarkdownRenderer {
  hasCodeFences(content: string): boolean;
  render(content: string): string;
  renderEnhanced(
    content: string,
    renderFence: MarkdownCodeFenceRenderer,
    signal?: AbortSignal,
  ): Promise<string>;
}

export function createMarkdownRenderer(): MarkdownRenderer {
  const highlightedFences = new WeakMap<object, string>();
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  markdown.use(katex, {
    delimiters: "all",
    throwOnError: false,
    // Plugin 1.1.3 owns KaTeX's strict callback through logger; strict:false is overwritten.
    // Keep tolerant rendering for model-authored math via the plugin's documented hook.
    logger: (): "ignore" => "ignore",
    trust: false,
  });

  const defaultFenceRenderer = markdown.renderer.rules.fence;
  markdown.renderer.rules.fence = (tokens, index, options, environment, self) => {
    const token = tokens[index];
    const highlightedHtml = token === undefined ? undefined : highlightedFences.get(token);
    if (highlightedHtml !== undefined) {
      return highlightedHtml;
    }
    return defaultFenceRenderer === undefined
      ? self.renderToken(tokens, index, options)
      : defaultFenceRenderer(tokens, index, options, environment, self);
  };

  function parse(content: string) {
    return markdown.parse(content, {});
  }

  function renderTokens(tokens: ReturnType<typeof parse>) {
    return markdown.renderer.render(tokens, markdown.options, {});
  }

  return {
    hasCodeFences(content) {
      return parse(content).some((token) => token.type === "fence");
    },
    render(content) {
      return renderTokens(parse(content));
    },
    async renderEnhanced(content, renderFence, signal) {
      signal?.throwIfAborted();
      const tokens = parse(content);
      for (const token of tokens) {
        signal?.throwIfAborted();
        if (token.type !== "fence") {
          continue;
        }
        const highlightedHtml = await renderFence({
          content: token.content,
          language: token.info,
        });
        signal?.throwIfAborted();
        if (highlightedHtml !== undefined) {
          highlightedFences.set(token, highlightedHtml);
        }
      }
      return renderTokens(tokens);
    },
  };
}
