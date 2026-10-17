import type { RealtimeServerMessage } from "~~/shared/types";
import { threadHistoryTurnFromUnknown } from "~~/shared/runtime/app-server";

type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

export function expectHostUpgradesSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "host.upgrades.snapshot")
    unexpectedResponse("host.upgrades.snapshot", message.type);
  return message;
}

export function expectWebPushConfigured(message: RealtimeResponseMessage) {
  if (message.type !== "notification.webPush.configured")
    unexpectedResponse("notification.webPush.configured", message.type);
  return message;
}

export function expectHostDaemonRestarted(message: RealtimeResponseMessage) {
  if (message.type !== "host.daemon.restarted") {
    unexpectedResponse("host.daemon.restarted", message.type);
  }
  return message;
}

function unexpectedResponse(expected: RealtimeResponseMessage["type"], actual: string): never {
  throw new Error(`Expected realtime response ${expected}, received ${actual}`);
}

export function expectBrowserOpened(message: RealtimeResponseMessage) {
  if (message.type !== "browser.opened") unexpectedResponse("browser.opened", message.type);
  return message;
}

export function expectBrowserClosed(message: RealtimeResponseMessage) {
  if (message.type !== "browser.closed") unexpectedResponse("browser.closed", message.type);
  return message;
}

export function expectFileGitComparison(message: RealtimeResponseMessage) {
  if (message.type !== "file.git.comparison") {
    unexpectedResponse("file.git.comparison", message.type);
  }
  return message;
}

export function expectFileGitWorkspaceSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "file.git.workspace.snapshot") {
    unexpectedResponse("file.git.workspace.snapshot", message.type);
  }
  return message;
}

export function expectProjectFileSearchResults(message: RealtimeResponseMessage) {
  if (message.type !== "file.search.results") {
    unexpectedResponse("file.search.results", message.type);
  }
  return message;
}

export function expectProjectDefaultsSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "project.defaults.snapshot") {
    unexpectedResponse("project.defaults.snapshot", message.type);
  }
  return message;
}

export function expectFileWatchReady(message: RealtimeResponseMessage) {
  if (message.type !== "file.watch.ready") {
    unexpectedResponse("file.watch.ready", message.type);
  }
  return message;
}

export function expectThreadGoalUpdated(message: RealtimeResponseMessage) {
  if (message.type !== "thread.goal.updated") {
    unexpectedResponse("thread.goal.updated", message.type);
  }
  return message;
}

export function expectThreadGoalSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "thread.goal.snapshot") {
    unexpectedResponse("thread.goal.snapshot", message.type);
  }
  return message;
}

export function expectTerminalOpened(message: RealtimeResponseMessage) {
  if (message.type !== "terminal.opened") unexpectedResponse("terminal.opened", message.type);
  return message;
}

export function expectTerminalClosed(message: RealtimeResponseMessage) {
  if (message.type !== "terminal.closed") unexpectedResponse("terminal.closed", message.type);
  return message;
}

export function expectThreadSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "thread.snapshot") unexpectedResponse("thread.snapshot", message.type);
  return message;
}

export function expectThreadStarted(message: RealtimeResponseMessage) {
  if (message.type !== "thread.started") unexpectedResponse("thread.started", message.type);
  return message;
}

export function expectTurnStartAccepted(message: RealtimeResponseMessage) {
  if (message.type !== "turn.start.accepted") {
    unexpectedResponse("turn.start.accepted", message.type);
  }
  if (message.turn === undefined) return { ...message, turn: undefined };
  const turn = threadHistoryTurnFromUnknown(message.turn);
  if (turn === null) throw new Error("Realtime turn.start.accepted contained an invalid turn");
  return { ...message, turn };
}

export function expectTurnSteerAccepted(message: RealtimeResponseMessage) {
  if (message.type !== "turn.steer.accepted") {
    unexpectedResponse("turn.steer.accepted", message.type);
  }
  return message;
}

export function expectTurnInterruptAccepted(message: RealtimeResponseMessage) {
  if (message.type !== "turn.interrupt.accepted") {
    unexpectedResponse("turn.interrupt.accepted", message.type);
  }
  return message;
}

export function expectTurnSettingsUpdated(message: RealtimeResponseMessage) {
  if (message.type !== "turn.settings.updated") {
    unexpectedResponse("turn.settings.updated", message.type);
  }
  return message;
}

export function expectMcpStatusSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "mcp.status.snapshot") {
    unexpectedResponse("mcp.status.snapshot", message.type);
  }
  return message;
}

export function expectMcpEventStreamAccepted(message: RealtimeResponseMessage) {
  if (message.type !== "mcp.event.stream.accepted") {
    unexpectedResponse("mcp.event.stream.accepted", message.type);
  }
  return message;
}

export function expectThreadTimelinePage(message: RealtimeResponseMessage) {
  if (message.type !== "thread.timeline.page") {
    unexpectedResponse("thread.timeline.page", message.type);
  }
  return message;
}

export function expectThreadItemsResult(message: RealtimeResponseMessage) {
  if (message.type !== "thread.items.result") {
    unexpectedResponse("thread.items.result", message.type);
  }
  return message;
}

export function expectThreadAttachmentsPage(message: RealtimeResponseMessage) {
  if (message.type !== "thread.attachments.page") {
    unexpectedResponse("thread.attachments.page", message.type);
  }
  return message;
}

export function expectThreadAttachmentAdded(message: RealtimeResponseMessage) {
  if (message.type !== "thread.attachment.added") {
    unexpectedResponse("thread.attachment.added", message.type);
  }
  return message;
}

export function expectThreadAttachmentRemoved(message: RealtimeResponseMessage) {
  if (message.type !== "thread.attachment.removed") {
    unexpectedResponse("thread.attachment.removed", message.type);
  }
  return message;
}

export function expectThreadSettingsSnapshot(message: RealtimeResponseMessage) {
  if (message.type !== "thread.settings.snapshot") {
    unexpectedResponse("thread.settings.snapshot", message.type);
  }
  return message;
}
