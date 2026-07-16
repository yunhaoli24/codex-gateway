import type {
  GatewayEvent,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadRuntimeStatus,
} from "~~/shared/types";
import { terminalTurnStatus } from "~~/shared/thread-runtime-status";
import { gatewayMemoryState } from "../state/memory";
import { hostStore } from "../state/hosts";
import type { ServerNotification } from "~~/shared/types";

export function threadTurnCompletedNotification(event: GatewayEvent): ServerNotification | null {
  const params = (event.payload as any)?.params ?? {};
  const turn = params.turn ?? {};
  const turnId = turn.id ? String(turn.id) : `event-${event.id}`;
  const status = terminalTurnStatus(turn.status);
  return {
    key: `thread-terminal:${event.hostId}:${event.threadId}:turn:${turnId}:${status}`,
    title: `${threadTitle(event.hostId, event.threadId)} · 回合已结束`,
    body: `${hostTitle(event.hostId)} 上的会话状态：${turnStatusLabel(status)}。可以继续输入下一步。`,
    group: "Codex Gateway",
    target: notificationTarget(event),
  };
}

export function threadGoalCompletedNotification(event: GatewayEvent): ServerNotification | null {
  const params = (event.payload as any)?.params ?? {};
  const goal = params.goal as ThreadGoal | undefined;
  if (!goal || !isTerminalGoalStatus(goal.status)) {
    return null;
  }
  return {
    key: `thread-goal:${event.hostId}:${event.threadId}:${goal.status}:${goal.updatedAt}`,
    title: `${threadTitle(event.hostId, event.threadId)} · 目标已结束`,
    body: [
      `${hostTitle(event.hostId)} 上的目标状态：${goalStatusLabel(goal.status)}。`,
      `推进 ${formatDuration(goal.timeUsedSeconds)}，使用 ${goal.tokensUsed.toLocaleString()} tokens。`,
    ].join(""),
    group: "Codex Gateway",
    target: notificationTarget(event),
  };
}

export function isTerminalGoalStatus(status: ThreadGoalStatus) {
  return status !== "active" && status !== "paused";
}

function notificationTarget(event: GatewayEvent) {
  const pinnedThread = gatewayMemoryState.pinnedThreads.find(
    (thread) => thread.hostId === event.hostId && thread.threadId === event.threadId,
  );
  const metadata = gatewayMemoryState.threadMetadata.find(
    (thread) => thread.hostId === event.hostId && thread.threadId === event.threadId,
  );
  return {
    kind: "thread" as const,
    hostId: event.hostId,
    projectId: pinnedThread?.projectId ?? metadata?.projectId ?? null,
    threadId: event.threadId,
  };
}

function threadTitle(hostId: number, threadId: string) {
  const pinnedThread = gatewayMemoryState.pinnedThreads.find(
    (thread) => thread.hostId === hostId && thread.threadId === threadId,
  );
  const metadata = gatewayMemoryState.threadMetadata.find(
    (thread) => thread.hostId === hostId && thread.threadId === threadId,
  );
  return pinnedThread?.title || metadata?.title || metadata?.name || metadata?.preview || threadId;
}

function hostTitle(hostId: number) {
  return hostStore.get(hostId)?.name || `Host ${hostId}`;
}

function turnStatusLabel(status: ThreadRuntimeStatus) {
  const labels: Record<ThreadRuntimeStatus, string> = {
    idle: "空闲",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    interrupted: "已中断",
  };
  return labels[status];
}

function goalStatusLabel(status: ThreadGoalStatus) {
  const labels: Record<ThreadGoalStatus, string> = {
    active: "推进中",
    paused: "已暂停",
    blocked: "已阻塞",
    usageLimited: "用量受限",
    budgetLimited: "预算已用尽",
    complete: "已完成",
  };
  return labels[status];
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}
