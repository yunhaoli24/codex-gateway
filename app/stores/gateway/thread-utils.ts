import type { ThreadSettingsState } from "~~/shared/types";
import type { ThreadRuntimeStatus } from "./types";

export function messageFromError(error: any, fallback: string) {
  return (
    error?.data?.message ||
    error?.data?.statusMessage ||
    error?.statusMessage ||
    error?.message ||
    fallback
  );
}

export function pinnedKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

export function selectedThreadKey(hostId: number | null, threadId: string | null) {
  return hostId && threadId ? pinnedKey(hostId, threadId) : null;
}

export function threadIdFromParams(params: any) {
  return params?.threadId;
}

export function isThreadActiveStatus(status: any) {
  const value = statusValue(status);
  return value === "active" || value === "inProgress" || value === "running";
}

export function runtimeStatusFromAppThreadStatus(status: any): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "active" || value === "inProgress" || value === "running") return "running";
  if (value === "systemError" || value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function terminalTurnStatus(status: any): ThreadRuntimeStatus {
  const value = statusValue(status);
  if (value === "failed") return "failed";
  if (value === "interrupted") return "interrupted";
  return "completed";
}

export function runtimeStatusFromThreadState(
  thread: unknown,
  history: unknown,
): ThreadRuntimeStatus | null {
  const candidates: any[] = [];
  if (thread && typeof thread === "object") {
    candidates.push(thread);
  }
  if (history && typeof history === "object") {
    candidates.push((history as any).thread, history);
  }

  const turns = [
    ...(Array.isArray((history as any)?.thread?.turns) ? (history as any).thread.turns : []),
    ...(Array.isArray((history as any)?.turns) ? (history as any).turns : []),
    ...(Array.isArray((thread as any)?.turns) ? (thread as any).turns : []),
  ];
  candidates.push(...turns);
  for (const turn of turns) {
    if (Array.isArray(turn?.items)) {
      candidates.push(...turn.items);
    }
  }

  const threadStatus = statusValue(
    (thread as any)?.status ?? (history as any)?.thread?.status ?? (history as any)?.status,
  );
  if (threadStatus === "idle" || threadStatus === "notLoaded") {
    return "completed";
  }
  if (threadStatus === "systemError") {
    return "failed";
  }
  if (threadStatus === "active") {
    return "running";
  }
  if (turns.length) {
    const latestTurn = turns.at(-1);
    const latestTurnStatus = statusValue(latestTurn?.status);
    if (
      latestTurnStatus === "completed" ||
      latestTurnStatus === "failed" ||
      latestTurnStatus === "interrupted"
    ) {
      return terminalTurnStatus(latestTurnStatus);
    }
    if (isThreadActiveStatus(latestTurnStatus)) {
      return "running";
    }
  }
  if (candidates.some((candidate) => isThreadActiveStatus(candidate?.status))) {
    return "running";
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "failed")) {
    return "failed";
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "interrupted")) {
    return "interrupted";
  }
  if (candidates.some((candidate) => statusValue(candidate?.status) === "completed")) {
    return "completed";
  }
  return null;
}

function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}

export function normalizeThreadSettings(
  settings: ThreadSettingsState | null | undefined,
): ThreadSettingsState {
  return {
    model: settings?.model || null,
    effort: settings?.effort || null,
    approvalPolicy:
      settings?.approvalPolicy === "untrusted" ||
      settings?.approvalPolicy === "on-request" ||
      settings?.approvalPolicy === "never"
        ? settings.approvalPolicy
        : null,
  };
}

export function mergeThreadSettings(
  current: ThreadSettingsState,
  next: ThreadSettingsState,
): ThreadSettingsState {
  return {
    model: "model" in next ? (next.model ?? null) : (current.model ?? null),
    effort: "effort" in next ? (next.effort ?? null) : (current.effort ?? null),
    approvalPolicy:
      "approvalPolicy" in next ? (next.approvalPolicy ?? null) : (current.approvalPolicy ?? null),
  };
}

export function titleForThread(thread: any) {
  return thread?.title || thread?.name || thread?.preview || thread?.id || "Untitled";
}

export function sortThreads(threads: any[]) {
  return [...threads].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return (
      Number(right.recencyAt || right.updatedAt || 0) -
      Number(left.recencyAt || left.updatedAt || 0)
    );
  });
}

function ensureHistoryThread(history: unknown, currentThread: unknown, threadId: string) {
  const historyRecord =
    history && typeof history === "object" ? (history as Record<string, any>) : null;
  const existingThread =
    historyRecord?.thread ||
    (currentThread && typeof currentThread === "object"
      ? (currentThread as Record<string, any>)
      : {});
  const thread = {
    ...existingThread,
    id: existingThread?.id || threadId,
    turns: Array.isArray(existingThread?.turns) ? [...existingThread.turns] : [],
  };
  return { thread };
}

export function mergeThreadTurns(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turns: any[],
  direction: "prepend" | "append",
) {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const existingTurns = nextHistory.thread.turns;
  const seen = new Set(
    existingTurns
      .map((turn: any) => turn?.id)
      .filter(Boolean)
      .map(String),
  );
  const incoming = turns.filter((turn: any) => {
    if (!turn?.id) {
      return true;
    }
    const id = String(turn.id);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  nextHistory.thread.turns =
    direction === "prepend" ? [...incoming, ...existingTurns] : [...existingTurns, ...incoming];
  return nextHistory;
}

function itemId(item: any) {
  return item?.id ? String(item.id) : "";
}

function itemClientId(item: any) {
  return item?.clientId ? String(item.clientId) : "";
}

function turnId(turn: any) {
  return turn?.id ? String(turn.id) : "";
}

function paramsTurnId(params: any) {
  return params?.turnId ? String(params.turnId) : "";
}

function isClientOnlyItem(item: any) {
  return item?.type === "userMessage" && item?.clientId && !item?.turnId;
}

function sameItem(left: any, right: any) {
  const leftId = itemId(left);
  const rightId = itemId(right);
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  const leftClientId = itemClientId(left);
  const rightClientId = itemClientId(right);
  return Boolean(leftClientId && rightClientId && leftClientId === rightClientId);
}

function findTurnForItem(turns: any[], item: any) {
  for (const turn of turns) {
    if (!Array.isArray(turn?.items)) {
      continue;
    }
    const itemIndex = turn.items.findIndex((candidate: any) => sameItem(candidate, item));
    if (itemIndex >= 0) {
      return { turn, itemIndex };
    }
  }
  return null;
}

function mergeTurnItems(existingItems: any[], incomingItems: any[]) {
  const nextItems = [...existingItems];
  for (const incoming of incomingItems) {
    const index = nextItems.findIndex((candidate) => sameItem(candidate, incoming));
    if (index >= 0) {
      nextItems[index] = { ...nextItems[index], ...incoming };
    } else {
      nextItems.push(incoming);
    }
  }
  return nextItems;
}

export function mergeItemIntoLatestTurn(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  item: any,
) {
  if (!item || typeof item !== "object") {
    return history;
  }
  const itemTurnId = item.turnId ? String(item.turnId) : "";
  if (!itemTurnId && !isClientOnlyItem(item)) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const existing = findTurnForItem(turns, item);
  if (existing) {
    existing.turn.items = [...existing.turn.items];
    existing.turn.items[existing.itemIndex] = {
      ...existing.turn.items[existing.itemIndex],
      ...item,
    };
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }

  const clientTurnId = isClientOnlyItem(item) ? `client-${item.clientId}` : "";
  const targetTurnId = itemTurnId || clientTurnId;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === targetTurnId);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: targetTurnId, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  } else {
    turn.items = [...turn.items];
  }

  const index = turn.items.findIndex((candidate: any) => sameItem(candidate, item));
  if (index >= 0) {
    turn.items[index] = { ...turn.items[index], ...item };
  } else {
    turn.items.push(item);
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

export function insertSteerItemIntoActiveTurn(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turnIdValue: string,
  item: any,
) {
  if (!item || typeof item !== "object" || !turnIdValue) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  }

  const existing = findTurnForItem(turns, item);
  if (existing) {
    existing.turn.items = [...existing.turn.items];
    existing.turn.items[existing.itemIndex] = {
      ...existing.turn.items[existing.itemIndex],
      ...item,
    };
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }

  turn = { ...turn, items: [...turn.items, item] };
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

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

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  } else {
    turn.items = [...turn.items];
  }

  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue);
  if (index >= 0) {
    const item = turn.items[index];
    turn.items[index] = { ...item, text: `${item.text || ""}${delta}` };
  } else {
    turn.items.push({
      type: "agentMessage",
      id: itemIdValue,
      text: delta,
      phase: "final_answer",
      turnId: turnIdValue,
      status: "inProgress",
    });
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
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

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  }
  turn = { ...turn, items: [...turn.items] };
  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue);
  if (index >= 0) {
    turn.items[index] = update(
      { ...turn.items[index], status: turn.items[index].status ?? "inProgress" },
      delta,
    );
  } else {
    turn.items.push(
      update({ type: itemType, id: itemIdValue, turnId: turnIdValue, status: "inProgress" }, delta),
    );
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
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

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turnIndex = turns.findIndex((candidate: any) => turnId(candidate) === turnIdValue);
  let turn = turnIndex >= 0 ? turns[turnIndex] : null;
  if (!turn) {
    turn = { id: turnIdValue, items: [], status: "inProgress" };
    turns.push(turn);
    turnIndex = turns.length - 1;
  }
  if (!Array.isArray(turn.items)) {
    return history;
  }

  turn = { ...turn, items: [...turn.items] };
  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue);
  if (index < 0) {
    turn.items.push({
      type: itemType,
      id: itemIdValue,
      turnId: turnIdValue,
      status: "inProgress",
      aggregatedOutput: delta,
    });
    turns[turnIndex] = turn;
    nextHistory.thread.turns = [...turns];
    return nextHistory;
  }
  const item = turn.items[index];
  turn.items[index] = { ...item, aggregatedOutput: `${item.aggregatedOutput || ""}${delta}` };
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

export function resolveServerRequestInHistory(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  requestIdValue: string | number,
) {
  const requestId = String(requestIdValue);
  if (!requestId) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  let changed = false;
  nextHistory.thread.turns = nextHistory.thread.turns.map((turn: any) => {
    if (!Array.isArray(turn?.items)) {
      return turn;
    }
    let turnChanged = false;
    const items = turn.items.map((item: any) => {
      if (String(item?.pendingApproval?.requestId ?? "") !== requestId) {
        return item;
      }
      const { pendingApproval: _pendingApproval, ...rest } = item;
      turnChanged = true;
      changed = true;
      return rest;
    });
    return turnChanged ? { ...turn, items } : turn;
  });
  return changed ? nextHistory : history;
}

export function updateTurnDiff(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  params: any,
) {
  if (!params?.turnId || typeof params.diff !== "string") {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  let turn = turns.find((candidate: any) => candidate?.id === params.turnId);
  if (!turn) {
    return history;
  }
  turn.diff = params.diff;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}

export function syncCompletedTurn(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turn: any,
) {
  if (!turn?.id) {
    return history;
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const turns = nextHistory.thread.turns;
  const index = turns.findIndex((candidate: any) => candidate?.id === turn.id);
  if (index >= 0) {
    const existingItems = Array.isArray(turns[index].items) ? turns[index].items : [];
    const incomingItems = Array.isArray(turn.items) ? turn.items : [];
    turns[index] = {
      ...turns[index],
      ...turn,
      items: mergeTurnItems(existingItems, incomingItems),
    };
  } else {
    turns.push(turn);
  }
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
