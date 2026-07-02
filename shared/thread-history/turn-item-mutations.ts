import { itemId, turnId } from "./item-identity";
import { ensureHistoryThread } from "./shape";

export function updateItemInTurnById(
  history: unknown,
  currentThread: unknown,
  threadId: string,
  turnIdValue: string,
  itemIdValue: string,
  createItem: () => any,
  updateItem: (item: any) => any,
) {
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
    turn.items[index] = updateItem({
      ...turn.items[index],
      status: turn.items[index].status ?? "inProgress",
    });
  } else {
    turn.items.push(createItem());
  }
  turns[turnIndex] = turn;
  nextHistory.thread.turns = [...turns];
  return nextHistory;
}
