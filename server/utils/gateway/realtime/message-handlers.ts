import { authenticatePeer } from "./handlers/auth";
import { restartHostDaemon } from "./handlers/host-daemon";
import { configureWebPush, subscribeWebPush, unsubscribeWebPush } from "./handlers/web-push";
import {
  subscribeHostLifecycle,
  unsubscribeHostLifecycle,
  readHostUpgrades,
} from "./handlers/host-lifecycle";
import {
  activateThread,
  readThreadSettings,
  startThread,
  subscribeThread,
  unsubscribeThread,
} from "./handlers/thread-events";
import { clearThreadGoal, getThreadGoal, setThreadGoal } from "./handlers/thread-goals";
import { loadThreadTimelinePage } from "./handlers/thread-timeline";
import { readThreadItems } from "./handlers/thread-items";
import {
  closeTerminal,
  listTerminals,
  openTerminal,
  resizeTerminal,
  writeTerminalInput,
} from "./handlers/terminal";
import {
  interruptTurn,
  ping,
  respondToServerRequest,
  startTurn,
  steerTurn,
  updateTurnSettings,
} from "./handlers/turns";
import { RealtimeMessageDispatcher } from "./message-dispatcher";
import {
  allowInsecureBrowserPreviewTls,
  closeBrowserPreview,
  openBrowserPreview,
} from "./handlers/browser-preview";
import { subscribeHostMetrics, unsubscribeHostMetrics } from "./handlers/host-metrics";
import {
  refreshTmuxSessions,
  subscribeTmuxSessions,
  unsubscribeTmuxSessions,
} from "./handlers/tmux-sessions";
import { compareGitFile, inspectGitWorkspace } from "./handlers/file-git";
import { listMcpStatuses, startMcpEventStream, stopMcpEventStream } from "./handlers/mcp-runtime";
import {
  searchProjectFiles,
  subscribeProjectFiles,
  unsubscribeProjectFiles,
} from "./handlers/files";
import { readProjectDefaults } from "./handlers/project-defaults";
import {
  handleHostMfaCancel,
  handleHostMfaConnect,
  handleHostMfaSubmit,
} from "./handlers/host-mfa";
import {
  addThreadAttachment,
  listThreadAttachments,
  removeThreadAttachment,
} from "./handlers/thread-attachments";

export const realtimeMessageDispatcher = new RealtimeMessageDispatcher({
  "auth.authenticate": { auth: "public", handler: authenticatePeer },
  "host.lifecycle.subscribe": subscribeHostLifecycle,
  "host.lifecycle.unsubscribe": unsubscribeHostLifecycle,
  "host.upgrades.read": readHostUpgrades,
  "host.daemon.restart": restartHostDaemon,
  "notification.webPush.configure": configureWebPush,
  "notification.webPush.subscribe": subscribeWebPush,
  "notification.webPush.unsubscribe": unsubscribeWebPush,
  "host.metrics.subscribe": subscribeHostMetrics,
  "host.metrics.unsubscribe": unsubscribeHostMetrics,
  "project.defaults.read": readProjectDefaults,
  "tmux.sessions.subscribe": subscribeTmuxSessions,
  "tmux.sessions.refresh": refreshTmuxSessions,
  "tmux.sessions.unsubscribe": unsubscribeTmuxSessions,
  "thread.activate": activateThread,
  "thread.settings.read": readThreadSettings,
  "thread.start": startThread,
  "thread.subscribe": subscribeThread,
  "thread.unsubscribe": unsubscribeThread,
  "thread.timeline.load": loadThreadTimelinePage,
  "thread.items.read": readThreadItems,
  "thread.attachments.list": listThreadAttachments,
  "thread.attachment.add": addThreadAttachment,
  "thread.attachment.remove": removeThreadAttachment,
  "thread.goal.set": setThreadGoal,
  "thread.goal.get": getThreadGoal,
  "thread.goal.clear": clearThreadGoal,
  "turn.start": startTurn,
  "turn.steer": steerTurn,
  "turn.interrupt": interruptTurn,
  "turn.settings.update": updateTurnSettings,
  "serverRequest.respond": respondToServerRequest,
  "terminal.open": openTerminal,
  "terminal.list": listTerminals,
  "terminal.input": writeTerminalInput,
  "terminal.resize": resizeTerminal,
  "terminal.close": closeTerminal,
  "browser.open": openBrowserPreview,
  "browser.close": closeBrowserPreview,
  "browser.allowInsecureTls": allowInsecureBrowserPreviewTls,
  "file.git.compare": compareGitFile,
  "file.git.workspace.inspect": inspectGitWorkspace,
  "file.search": searchProjectFiles,
  "file.watch.subscribe": subscribeProjectFiles,
  "file.watch.unsubscribe": unsubscribeProjectFiles,
  "mcp.status.list": listMcpStatuses,
  "mcp.event.stream.start": startMcpEventStream,
  "mcp.event.stream.stop": stopMcpEventStream,
  "host.mfa.submit": handleHostMfaSubmit,
  "host.mfa.connect": handleHostMfaConnect,
  "host.mfa.cancel": handleHostMfaCancel,
  ping,
});
