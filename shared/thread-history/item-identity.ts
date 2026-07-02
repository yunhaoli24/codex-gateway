export function itemId(item: any) {
  return item?.id ? String(item.id) : "";
}

export function itemClientId(item: any) {
  return item?.clientId ? String(item.clientId) : "";
}

export function turnId(turn: any) {
  return turn?.id ? String(turn.id) : "";
}

export function paramsTurnId(params: any) {
  return params?.turnId ? String(params.turnId) : "";
}

export function isClientOnlyItem(item: any) {
  return item?.type === "userMessage" && item?.clientId && !item?.turnId;
}

export function sameItem(left: any, right: any) {
  const leftId = itemId(left);
  const rightId = itemId(right);
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  const leftClientId = itemClientId(left);
  const rightClientId = itemClientId(right);
  return Boolean(leftClientId && rightClientId && leftClientId === rightClientId);
}

export function findTurnForItem(turns: any[], item: any) {
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
