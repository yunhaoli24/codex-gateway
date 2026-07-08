import type { ThreadGoal, ThreadGoalTimelineItem } from "~~/shared/types";

export function threadGoalTimelineItem(
  goal: ThreadGoal,
  turnId?: string | null,
): ThreadGoalTimelineItem | null {
  const objective = goal.objective.trim();
  if (!objective) {
    return null;
  }
  const id = `thread-goal:${goal.threadId}:${goal.createdAt}:${hashText(objective)}`;
  return {
    type: "threadGoal",
    id,
    ...(turnId ? { turnId } : {}),
    threadId: goal.threadId,
    objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
