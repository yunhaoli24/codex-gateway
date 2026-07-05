import type { ThreadGoal } from "~~/shared/types";

export function shouldInsertGoalObjectiveMessage(
  previous: ThreadGoal | null | undefined,
  next: ThreadGoal,
) {
  return Boolean(
    isEditableGoalStatus(next.status) &&
    next.objective.trim() &&
    previous?.objective !== next.objective,
  );
}

export function goalObjectiveMessageItem(goal: ThreadGoal, turnId?: string | null) {
  const clientId = `goal-${goal.threadId}-${hashText(goal.objective)}`;
  return {
    type: "userMessage",
    id: clientId,
    clientId,
    ...(turnId ? { turnId } : {}),
    content: [{ type: "text", text: `/goal ${goal.objective}`, text_elements: [] }],
  };
}

function isEditableGoalStatus(status: ThreadGoal["status"]) {
  return status === "active" || status === "paused";
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
