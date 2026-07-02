export function activeRemoteTurnId(history: unknown) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const status = typeof turn?.status === "string" ? turn.status : turn?.status?.type;
    const id = turn?.id ? String(turn.id) : "";
    if ((isRunningTurnStatus(status) || hasRunningItems(turn)) && id && !id.startsWith("client-")) {
      return id;
    }
  }
  return null;
}

export function activeTurnIdFromRuntimeState(
  history: unknown,
  activeTurnId: string | null | undefined,
) {
  return activeRemoteTurnId(history) ?? (activeTurnId ? String(activeTurnId) : null);
}

function isRunningTurnStatus(status: unknown) {
  return (
    status === "inProgress" ||
    status === "in_progress" ||
    status === "running" ||
    status === "active" ||
    status === "pending" ||
    status === "starting" ||
    status === "waitingForClient" ||
    status === "waitingForApproval"
  );
}

function hasRunningItems(turn: any) {
  return (
    Array.isArray(turn?.items) &&
    turn.items.some((item: any) =>
      isRunningTurnStatus(typeof item?.status === "string" ? item.status : item?.status?.type),
    )
  );
}
