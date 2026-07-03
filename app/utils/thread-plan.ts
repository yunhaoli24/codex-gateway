export function isThreadPlanItem(item: any) {
  return item?.type === "plan" || item?.type === "turnPlan";
}

export function isThreadPlanItemCompleted(item: any) {
  return item?.type === "turnPlan" || statusValue(item?.status) === "completed";
}

export function latestThreadPlanItem(history: unknown) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const items = Array.isArray(turns[turnIndex]?.items) ? turns[turnIndex].items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (isThreadPlanItem(item)) {
        return item;
      }
    }
  }
  return null;
}

export function planItemSummary(item: any) {
  if (!item) {
    return "";
  }
  if (item.type === "turnPlan") {
    return (
      textValue(item.explanation) ||
      (Array.isArray(item.plan) ? textValue(item.plan[0]?.step) : "") ||
      ""
    );
  }
  return textValue(item.text || item.explanation);
}

function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
