export function activeRemoteTurnId(history: unknown) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const status = typeof turn?.status === "string" ? turn.status : turn?.status?.type;
    const id = turn?.id ? String(turn.id) : "";
    if (isRunningTurnStatus(status) && id && !id.startsWith("client-")) {
      return id;
    }
  }
  return null;
}

function isRunningTurnStatus(status: unknown) {
  return status === "inProgress" || status === "running" || status === "active";
}
