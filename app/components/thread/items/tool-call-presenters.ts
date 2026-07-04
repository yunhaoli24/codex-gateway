import { jsonPreview } from "@/utils/thread-items";

type ToolCallItem = Record<string, any>;

export type ToolCallIcon = "image" | "search" | "tool";

export interface ToolCallDetailSection {
  label: string;
  content: string;
  markdown?: boolean;
}

export interface ToolCallPresentation {
  title: string;
  icon: ToolCallIcon;
  details: ToolCallDetailSection[];
}

type Translate = (key: string) => string;
type ToolCallPresenter = (item: ToolCallItem, t: Translate) => ToolCallPresentation;

const emptyDetails: ToolCallDetailSection[] = [];

const toolCallPresenters: Record<string, ToolCallPresenter> = {
  mcpToolCall: (item, t) => ({
    title: `${item.server || "MCP"} · ${item.tool || "tool"}`,
    icon: "tool",
    details: compactDetails([
      { label: t("app.arguments"), content: jsonPreview(item.arguments) },
      item.result ? { label: t("app.result"), content: jsonPreview(item.result) } : null,
      item.error?.message
        ? { label: t("app.error"), content: item.error.message, markdown: true }
        : null,
    ]),
  }),

  dynamicToolCall: (item, t) => ({
    title: item.name || item.tool || "Tool call",
    icon: "tool",
    details: compactDetails([
      { label: t("app.arguments"), content: jsonPreview(item.arguments) },
      Array.isArray(item.contentItems) && item.contentItems.length
        ? { label: t("app.result"), content: jsonPreview(item.contentItems) }
        : null,
    ]),
  }),

  webSearch: (item, t) => ({
    title: item.query || "Web search",
    icon: "search",
    details: compactDetails([
      item.action ? { label: t("app.action"), content: jsonPreview(item.action) } : null,
    ]),
  }),

  imageGeneration: (item, t) => ({
    title: item.revisedPrompt || t("app.imageGeneration"),
    icon: "image",
    details: compactDetails([
      item.result ? { label: t("app.result"), content: item.result, markdown: true } : null,
      item.savedPath ? { label: t("app.savedPath"), content: String(item.savedPath) } : null,
    ]),
  }),

  enteredReviewMode: (item, t) => reviewModePresentation(item, t, t("app.enteredReviewMode")),
  exitedReviewMode: (item, t) => reviewModePresentation(item, t, t("app.exitedReviewMode")),
};

export function presentToolCall(item: ToolCallItem, t: Translate): ToolCallPresentation {
  const presenter = toolCallPresenters[item.type] ?? defaultToolCallPresenter;
  return presenter(item, t);
}

function defaultToolCallPresenter(item: ToolCallItem): ToolCallPresentation {
  return {
    title: item.type,
    icon: "tool",
    details: emptyDetails,
  };
}

function reviewModePresentation(item: ToolCallItem, t: Translate, title: string) {
  return {
    title,
    icon: "tool" as const,
    details: compactDetails([
      item.review ? { label: t("app.review"), content: item.review, markdown: true } : null,
    ]),
  };
}

function compactDetails(details: Array<ToolCallDetailSection | null>) {
  return details.filter((detail): detail is ToolCallDetailSection => Boolean(detail?.content));
}
