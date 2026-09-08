import type { ThreadHistoryItem } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import { readableAsyncQuestionReply } from "~~/shared/thread-history/async-user-questions";

export function threadItemText(item: ThreadHistoryItem) {
  if (item.type === "userMessage") {
    const text = (Array.isArray(item.content) ? item.content : [])
      .map((part) => {
        const record = recordFromUnknown(part);
        return textValue(record?.text) || textValue(record?.content);
      })
      .filter(Boolean)
      .join("\n");
    return readableAsyncQuestionReply(text) ?? text;
  }
  if (item.type === "agentMessage" || item.type === "plan") {
    const text = textValue(item.text);
    return readableAsyncQuestionReply(text) ?? text;
  }
  if (item.type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary : [];
    const content = Array.isArray(item.content) ? item.content : [];
    return [...summary, ...content].map(textValue).filter(Boolean).join("\n");
  }
  if (item.type === "hookPrompt") {
    return (Array.isArray(item.fragments) ? item.fragments : [])
      .map((fragment) => textValue(recordFromUnknown(fragment)?.text))
      .filter(Boolean)
      .join("\n");
  }
  if (item.type === "turnPlan") {
    return [
      item.explanation,
      ...(Array.isArray(item.plan)
        ? item.plan.map((step) => {
            const record = recordFromUnknown(step);
            return `- [${textValue(record?.status) || "pending"}] ${textValue(record?.step)}`;
          })
        : []),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function truncateText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n...` : value;
}

export function statusValue(status: unknown) {
  return typeof status === "string" ? status : recordFromUnknown(status)?.type;
}

export function isItemInProgress(item: ThreadHistoryItem) {
  const status = statusValue(item.status);
  return (
    status === "inProgress" ||
    status === "in_progress" ||
    status === "running" ||
    status === "active" ||
    status === "pending" ||
    status === "starting"
  );
}

export function threadItemResultText(item: ThreadHistoryItem) {
  if (typeof item.result === "string") return item.result;
  return typeof item.result?.text === "string" ? item.result.text : "";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function jsonPreview(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
