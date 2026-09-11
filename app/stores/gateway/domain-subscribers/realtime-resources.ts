import { toast } from "@codex-gateway/ui/sonner";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayHostMetricsDataStore } from "@/stores/gateway-host-metrics/data";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { useGatewayHostMfaStore } from "@/stores/gateway-host-mfa";
import { gatewayDomainEvents } from "../domain-events";
import { notificationAction, projectPublishedNotification } from "../notifications/actions";

export function registerRealtimeResourceSubscribers() {
  gatewayDomainEvents.on("realtime-tmux-sessions", (snapshot) => {
    useGatewayTmuxStore().applySessionsSnapshot(snapshot);
  });
  gatewayDomainEvents.on("realtime-host-metrics-snapshot", (snapshot) => {
    useGatewayHostMetricsDataStore().applySnapshot(snapshot);
  });
  gatewayDomainEvents.on("realtime-host-metrics-sample", ({ hostId, sample, gpuProcesses }) => {
    useGatewayHostMetricsDataStore().appendSample(hostId, sample, gpuProcesses);
  });
  gatewayDomainEvents.on("realtime-host-metrics-status", ({ hostId, status, message }) => {
    useGatewayHostMetricsDataStore().setStatus(hostId, status, message);
  });
  gatewayDomainEvents.on("realtime-thread-goal-updated", (message) => {
    useGatewayComposerStore().upsertThreadGoal(message.hostId, message.threadId, message.goal);
  });
  gatewayDomainEvents.on("realtime-thread-goal-cleared", (message) => {
    useGatewayComposerStore().clearThreadGoalState(message.hostId, message.threadId);
  });
  gatewayDomainEvents.on("realtime-thread-goal-snapshot", (message) => {
    const composer = useGatewayComposerStore();
    if (message.goal) composer.upsertThreadGoal(message.hostId, message.threadId, message.goal);
    else composer.clearThreadGoalState(message.hostId, message.threadId);
  });
  gatewayDomainEvents.on("realtime-terminal-opened", ({ session }) => {
    useGatewayTerminalStore().upsertTerminalSession(session);
  });
  gatewayDomainEvents.on("realtime-terminal-snapshot", ({ sessions }) => {
    useGatewayTerminalStore().replaceTerminalSessions(sessions);
  });
  gatewayDomainEvents.on("realtime-terminal-closed", ({ sessionId }) => {
    useGatewayTerminalStore().removeTerminalSession(sessionId);
  });
  gatewayDomainEvents.on("realtime-terminal-output", ({ sessionId, data }) => {
    useGatewayTerminalStore().appendTerminalOutput(sessionId, data);
  });
  gatewayDomainEvents.on("realtime-terminal-exited", ({ sessionId, displayMessage }) => {
    useGatewayTerminalStore().markTerminalExited(sessionId, displayMessage);
  });
  gatewayDomainEvents.on("realtime-terminal-error", ({ sessionId, message }) => {
    if (sessionId !== undefined && sessionId !== "") {
      useGatewayTerminalStore().markTerminalExited(sessionId, message);
    }
    useGatewayBootstrapStore().setError(message);
  });
  gatewayDomainEvents.on("realtime-browser-opened", ({ session }) => {
    useGatewayBrowserStore().upsertSession(session);
  });
  gatewayDomainEvents.on("realtime-browser-closed", ({ sessionId }) => {
    useGatewayBrowserStore().removeSession(sessionId);
  });
  gatewayDomainEvents.on("realtime-browser-error", ({ message }) => {
    useGatewayBootstrapStore().setError(message);
  });
  gatewayDomainEvents.on("realtime-browser-frame-warning", ({ sessionId, value }) => {
    useGatewayBrowserStore().setFrameWarning(sessionId, value);
  });
  gatewayDomainEvents.on("realtime-browser-resource-failed", ({ sessionId, failure }) => {
    useGatewayBrowserStore().addResourceFailure(sessionId, failure);
  });
  gatewayDomainEvents.on("realtime-notification-published", ({ notification, actionLabel }) => {
    projectPublishedNotification(notification);
    const action = notificationAction(notification);
    toast.info(notification.title, {
      id: notification.key,
      description: notification.body,
      duration: 10_000,
      action: { label: actionLabel, onClick: action.run },
    });
  });

  // Register MFA realtime handler
  useGatewayHostMfaStore().register();
}
