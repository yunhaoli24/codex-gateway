import type { ThreadTimelineItem, ThreadTimelineTurn } from "~~/shared/types";
import { asyncQuestionsForItem } from "~~/shared/thread-history/async-user-questions";
import { isThreadPlanItem } from "@/utils/thread-plan";

export interface ThreadTurnSections {
  items: ThreadTimelineItem[];
  intermediateItems: ThreadTimelineItem[];
  finalItems: ThreadTimelineItem[];
  finalAgentIndex: number;
  hasFinalAnswer: boolean;
}

export function buildThreadTurnSections(
  turn: ThreadTimelineTurn,
  options: { planModeActive: boolean },
): ThreadTurnSections {
  // Codex may complete assistant items with no text or only whitespace between tool calls.
  // Omit those at the row-model boundary: hiding just the component still leaves the virtual
  // row's measured padding behind. Keep the protocol history intact, and retain async questions
  // even when their text is empty. A streaming placeholder appears as soon as content arrives.
  const items = (Array.isArray(turn.items) ? turn.items : []).filter(
    (item) =>
      item.type !== "agentMessage" ||
      (typeof item.text === "string" && item.text.trim() !== "") ||
      asyncQuestionsForItem(item).length > 0,
  );
  const finalAgentIndex = findFinalAgentIndex(items, turn.status, options.planModeActive);
  const hasFinalAnswer = finalAgentIndex >= 0;

  return {
    items,
    finalAgentIndex,
    hasFinalAnswer,
    intermediateItems: items.filter(
      (item, index) => (!hasFinalAnswer || index < finalAgentIndex) && isIntermediateItem(item),
    ),
    finalItems: hasFinalAnswer ? items.slice(finalAgentIndex) : [],
  };
}

export function itemKey(item: ThreadTimelineItem, section: string, index: number) {
  const id = typeof item.id === "string" && item.id !== "" ? item.id : item.clientId;
  return typeof id === "string" && id !== "" ? id : `${section}-${index}-${item.type}`;
}

function findFinalAgentIndex(
  turnItems: ThreadTimelineItem[],
  status: unknown,
  preferPlanFinal: boolean,
) {
  const explicitFinalIndex = findLastIndex(
    turnItems,
    (item) => item?.type === "agentMessage" && item?.phase === "final_answer",
  );
  if (explicitFinalIndex >= 0) {
    return explicitFinalIndex;
  }
  if (status !== "completed") {
    return -1;
  }
  if (preferPlanFinal) {
    const finalPlanIndex = findLastIndex(turnItems, isThreadPlanItem);
    if (finalPlanIndex >= 0) {
      return finalPlanIndex;
    }
  }
  const finalAgentMessageIndex = findLastIndex(turnItems, (item) => item?.type === "agentMessage");
  if (finalAgentMessageIndex >= 0) {
    return finalAgentMessageIndex;
  }
  return findLastIndex(turnItems, (item) => item?.type === "appNotification");
}

function isLeadTranscriptItem(item: ThreadTimelineItem) {
  return item?.type === "userMessage" || item?.type === "threadGoal";
}

function isIntermediateItem(item: ThreadTimelineItem) {
  return !isLeadTranscriptItem(item);
}

function findLastIndex<T>(list: T[], predicate: (item: T) => boolean) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (item !== undefined && predicate(item)) {
      return index;
    }
  }
  return -1;
}
