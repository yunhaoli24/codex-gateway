import type { ThreadAsyncUserInputQuestion, ThreadHistoryItem } from "./types";
import { recordFromUnknown } from "../utils/records";

export interface AsyncUserQuestion {
  title: string;
  options: string[] | null;
}

export interface AsyncUserQuestionAnswer {
  questionItemId: string;
  question: string;
  answer: string;
}

const REPLY_TAG = "send_user_message_question_reply";
const REPLY_TAG_PATTERN = new RegExp(`<${REPLY_TAG}>\\s*([\\s\\S]*?)\\s*</${REPLY_TAG}>`);

/**
 * The app-server uses the agent-message id plus the question index as the
 * stable identity of an async question. Keep this wire detail here so the
 * Vue component never has to invent protocol strings or ids.
 */
export function asyncQuestionItemId(itemId: string, questionIndex: number) {
  return JSON.stringify(["request_user_input_async", itemId, questionIndex]);
}

export function asyncQuestionsForItem(item: ThreadHistoryItem): AsyncUserQuestion[] {
  if (item.delivery !== "async" || !Array.isArray(item.questions)) {
    return [];
  }

  return item.questions.flatMap((question: ThreadAsyncUserInputQuestion) => {
    if (typeof question.title !== "string" || question.title.trim() === "") {
      return [];
    }
    const options = Array.isArray(question.options)
      ? question.options.filter((option): option is string => typeof option === "string")
      : null;
    return [{ title: question.title, options }];
  });
}

export function buildAsyncQuestionReply(
  item: ThreadHistoryItem,
  questions: readonly AsyncUserQuestion[],
  answers: readonly string[],
) {
  const itemId = typeof item.id === "string" ? item.id : "";
  if (itemId === "" || questions.length === 0 || questions.length !== answers.length) {
    return null;
  }

  const replies: AsyncUserQuestionAnswer[] = questions.map((question, index) => ({
    questionItemId: asyncQuestionItemId(itemId, index),
    question: question.title,
    answer: answers[index] ?? "",
  }));

  return `<${REPLY_TAG}> ${JSON.stringify(replies)} </${REPLY_TAG}>`;
}

/**
 * Replies are deliberately stored as ordinary user text by app-server. The
 * marker is an internal transport convention, so only the display projection
 * should remove it; history and future replies still use the exact wire text.
 */
export function readableAsyncQuestionReply(value: string) {
  const match = REPLY_TAG_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const payload = match[1];
  if (payload === undefined) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }

  const entries = parsed.flatMap((entry) => {
    const record = recordFromUnknown(entry);
    const question = record?.question;
    const answer = record?.answer;
    return typeof question === "string" && typeof answer === "string"
      ? [`**${question}**\n\n${answer}`]
      : [];
  });
  return entries.length > 0 ? entries.join("\n\n") : null;
}
