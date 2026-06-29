import { paramsTurnId } from "./item-identity";
import { updateItemInTurnById } from "./turn-item-mutations";

export function appendAgentDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
) {
  const itemIdValue = params?.itemId ? String(params.itemId) : "";
  const turnIdValue = paramsTurnId(params);
  const delta = params?.delta || "";
  if (!itemIdValue || !turnIdValue || !delta) {
    return history;
  }

  return updateItemInTurnById(
    history,
    currentThread,
    threadId,
    turnIdValue,
    itemIdValue,
    () => ({
      type: "agentMessage",
      id: itemIdValue,
      text: delta,
      phase: "final_answer",
      turnId: turnIdValue,
      status: "inProgress",
    }),
    (item) => ({ ...item, text: `${item.text || ""}${delta}` }),
  );
}

export function appendPlanDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
) {
  return appendTextDelta(history, currentThread, threadId, params, "plan", (item, delta) => ({
    ...item,
    text: `${item.text || ""}${delta}`,
  }));
}

export function appendReasoningSummaryDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
) {
  return appendTextDelta(history, currentThread, threadId, params, "reasoning", (item, delta) => {
    const summary = Array.isArray(item.summary) ? [...item.summary] : [];
    const index = typeof params.summaryIndex === "number" ? params.summaryIndex : summary.length;
    summary[index] = `${summary[index] || ""}${delta}`;
    return { ...item, summary };
  });
}

export function appendReasoningTextDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
) {
  return appendTextDelta(history, currentThread, threadId, params, "reasoning", (item, delta) => {
    const content = Array.isArray(item.content) ? [...item.content] : [];
    const index = typeof params.contentIndex === "number" ? params.contentIndex : content.length;
    content[index] = `${content[index] || ""}${delta}`;
    return { ...item, content };
  });
}

function appendTextDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
  itemType: string,
  update: (item: any, delta: string) => any,
) {
  const itemIdValue = params?.itemId ? String(params.itemId) : "";
  const turnIdValue = paramsTurnId(params);
  const delta = params?.delta || "";
  if (!itemIdValue || !turnIdValue || !delta) {
    return history;
  }

  return updateItemInTurnById(
    history,
    currentThread,
    threadId,
    turnIdValue,
    itemIdValue,
    () =>
      update({ type: itemType, id: itemIdValue, turnId: turnIdValue, status: "inProgress" }, delta),
    (item) => update(item, delta),
  );
}

export function appendItemOutputDelta(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
  itemType: "commandExecution" | "fileChange",
) {
  const itemIdValue = params?.itemId ? String(params.itemId) : "";
  const turnIdValue = paramsTurnId(params);
  const delta = params?.delta || "";
  if (!itemIdValue || !turnIdValue || !delta) {
    return history;
  }

  return updateItemInTurnById(
    history,
    currentThread,
    threadId,
    turnIdValue,
    itemIdValue,
    () => ({
      type: itemType,
      id: itemIdValue,
      turnId: turnIdValue,
      status: "inProgress",
      aggregatedOutput: delta,
    }),
    (item) => ({ ...item, aggregatedOutput: `${item.aggregatedOutput || ""}${delta}` }),
  );
}
