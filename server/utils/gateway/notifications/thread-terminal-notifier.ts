import type { GatewayEvent, ThreadRuntimeStatus } from "~~/shared/types";
import { terminalTurnStatus } from "~~/shared/thread-runtime-status";
import { gatewayMemoryState } from "../state/memory";
import { hostStore } from "../state/hosts";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { serverNotificationService } from "./notification-service";

export function notifyThreadTurnCompleted(event: GatewayEvent) {
  if (event.method !== "turn/completed") {
    return;
  }
  if (subAgentThreadStore.isSubAgentThread(event.hostId, event.threadId)) {
    return;
  }
  const params = (event.payload as any)?.params ?? {};
  const turn = params.turn ?? {};
  const turnId = turn.id ? String(turn.id) : `event-${event.id}`;
  const status = terminalTurnStatus(turn.status);
  serverNotificationService.dispatch({
    key: threadTerminalNotificationKey(event.hostId, event.threadId, turnId, status),
    title: `${threadTitle(event.hostId, event.threadId)} · 回合已结束`,
    body: `${hostTitle(event.hostId)} 上的会话状态：${statusLabel(status)}。可以继续输入下一步。`,
    group: "Codex Gateway",
  });
}

function threadTerminalNotificationKey(
  hostId: number,
  threadId: string,
  turnId: string,
  status: ThreadRuntimeStatus,
) {
  return `thread-terminal:${hostId}:${threadId}:turn:${turnId}:${status}`;
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

function statusLabel(status: ThreadRuntimeStatus) {
  const labels: Record<ThreadRuntimeStatus, string> = {
    idle: "空闲",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    interrupted: "已中断",
  };
  return labels[status];
}
