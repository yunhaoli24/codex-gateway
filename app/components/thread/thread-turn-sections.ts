import { isThreadActiveStatus } from "~~/shared/thread-runtime-status";
import { isThreadPlanItem } from "@/utils/thread-plan";

export interface ThreadTurnSections {
  items: any[];
  userItems: any[];
  intermediateItems: any[];
  finalItems: any[];
  finalAgentIndex: number;
  firstIntermediateIndex: number;
  hasFinalAnswer: boolean;
  turnIsActive: boolean;
}

export function buildThreadTurnSections(
  turn: Record<string, any>,
  options: { planModeActive: boolean },
): ThreadTurnSections {
  const items = Array.isArray(turn.items) ? turn.items : [];
  const finalAgentIndex = findFinalAgentIndex(items, turn.status, options.planModeActive);
  const hasFinalAnswer = finalAgentIndex >= 0;
  const firstIntermediateIndex = firstIntermediateItemIndex(items);

  return {
    items,
    finalAgentIndex,
    firstIntermediateIndex,
    hasFinalAnswer,
    turnIsActive: isTurnActive(turn, items),
    userItems: items.slice(0, firstIntermediateIndex),
    intermediateItems: hasFinalAnswer
      ? items.slice(firstIntermediateIndex, finalAgentIndex)
      : items.slice(firstIntermediateIndex),
    finalItems: hasFinalAnswer ? items.slice(finalAgentIndex) : [],
  };
}

export function userMessageVariant(item: any, sections: Pick<ThreadTurnSections, "items">) {
  if (item?.type !== "userMessage") {
    return "normal";
  }
  if (isSteerUserMessage(item)) {
    return "steer";
  }
  const itemIndex = sections.items.findIndex((candidate: any) => candidate === item);
  return hasEarlierNonUserItem(sections.items, itemIndex) ? "steer" : "normal";
}

export function itemKey(item: any, section: string, index: number) {
  return item?.id || item?.clientId || `${section}-${index}-${item?.type || "item"}`;
}

export function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}

export function itemStatusSignature(items: any[]) {
  return items.map((item: any) => statusValue(item?.status));
}

function findFinalAgentIndex(turnItems: any[], status: unknown, preferPlanFinal: boolean) {
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

function firstIntermediateItemIndex(items: any[]) {
  const firstNonUser = items.findIndex(
    (item: any) => item?.type !== "userMessage" || isSteerUserMessage(item),
  );
  return firstNonUser >= 0 ? firstNonUser : items.length;
}

function isTurnActive(turn: Record<string, any>, items: any[]) {
  return (
    isThreadActiveStatus(turn.status) || items.some((item) => isThreadActiveStatus(item?.status))
  );
}

function isSteerUserMessage(item: any) {
  return (
    item?.type === "userMessage" &&
    typeof item.clientId === "string" &&
    item.clientId.startsWith("steer-")
  );
}

function hasEarlierNonUserItem(items: any[], beforeIndex: number) {
  return items.some(
    (candidate: any, index) => index < beforeIndex && candidate?.type !== "userMessage",
  );
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
