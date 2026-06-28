export function threadItemText(item: Record<string, any>) {
  if (item.type === "userMessage") {
    return (item.content || [])
      .map((part: any) => part?.text || part?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  if (item.type === "agentMessage" || item.type === "plan") {
    return item.text || "";
  }
  if (item.type === "reasoning") {
    return [...(item.summary || []), ...(item.content || [])].filter(Boolean).join("\n");
  }
  if (item.type === "hookPrompt") {
    return (item.fragments || [])
      .map((fragment: any) => fragment?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  if (item.type === "turnPlan") {
    return [
      item.explanation,
      ...(Array.isArray(item.plan)
        ? item.plan.map((step: any) => `- [${step?.status || "pending"}] ${step?.step || ""}`)
        : []),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function truncateText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n...` : value;
}

export function statusValue(status: any) {
  return typeof status === "string" ? status : status?.type;
}

export function isItemInProgress(item: Record<string, any>) {
  const status = statusValue(item.status);
  return (
    status === "inProgress" ||
    status === "in_progress" ||
    status === "running" ||
    status === "active" ||
    status === "pending" ||
    status === "starting"
  );
}

export function jsonPreview(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
