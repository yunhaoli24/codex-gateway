/**
 * Codex provider adapter — the only translation boundary between the Codex
 * app-server protocol and the Gateway canonical event model.
 *
 * Everything Codex-specific (event mapping, item lifecycle timing, file-change
 * sequencing, server-request routing) lives in this directory. Neutral runtime
 * code resolves this module through the provider registry and never imports
 * the individual Codex files directly.
 */
import type {
  AgentRpcClient,
  ProviderAdapter,
  ProviderMappingResult,
  ProviderNotification,
} from "../../provider-adapter";
import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { CodexRpcClient } from "../../../infra/rpc/rpc";
import { codexRuntime } from "../../../infra/host-services";
import { runtimeLog } from "../../../runtime/runtime-log";
import { buildCurrentTimeReadResponse, isCurrentTimeReadRequest } from "./codex-server-requests";
import { mapCodexNotification } from "./codex-event-mapper";

export const codexProviderAdapter: ProviderAdapter = {
  id: "codex",
  createClient(host: HostRecord): AgentRpcClient {
    return new CodexRpcClient(host);
  },
  handleServerRequest(client: AgentRpcClient, message: RpcEnvelope) {
    if (!isCurrentTimeReadRequest(message)) return false;
    if (message.id !== undefined) client.respond(message.id, buildCurrentTimeReadResponse());
    return true;
  },
  handleNotification(client: AgentRpcClient, host: HostRecord, message: RpcEnvelope) {
    if (message.method !== "turn/completed" || !clientHasDeferredUpgrade(client)) return;
    void codexRuntime
      .completeDeferredUpgrade(host)
      .then((stopped) => {
        if (stopped === true) resolveDeferredUpgrade(client);
      })
      .catch((error) => {
        runtimeLog("deferred Codex upgrade check failed", {
          hostId: host.id,
          hostName: host.name,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  },
  mapNotification(notification: ProviderNotification): ProviderMappingResult {
    const mapped = mapCodexNotification(notification);
    if (mapped === null && notification.method === "currentTime/read") {
      return { kind: "ignored", method: notification.method, reason: "handled" };
    }
    if (mapped === null) {
      return {
        kind: "rejected",
        method: notification.method,
        code: isKnownCodexNotificationMethod(notification.method)
          ? "invalid-payload"
          : "unsupported-method",
        message: isKnownCodexNotificationMethod(notification.method)
          ? `Codex notification "${notification.method}" did not satisfy its canonical payload contract`
          : `Codex notification "${notification.method}" is not in the provider allowlist`,
      };
    }
    return {
      kind: "event",
      event: mapped.event,
      emittedAtMs: mapped.emittedAt,
    };
  },
};

function clientHasDeferredUpgrade(client: AgentRpcClient) {
  return client.hasDeferredUpgrade?.() === true;
}

function resolveDeferredUpgrade(client: AgentRpcClient) {
  client.resolveDeferredUpgrade?.();
}

function isKnownCodexNotificationMethod(method: string) {
  return [
    "turn/started",
    "turn/completed",
    "turn/diff/updated",
    "turn/plan/updated",
    "item/started",
    "item/completed",
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/fileChange/patchUpdated",
    "currentTime/read",
    "serverRequest/resolved",
    "item/agentMessage/delta",
    "item/plan/delta",
    "item/reasoning/summaryTextDelta",
    "item/reasoning/textDelta",
    "item/commandExecution/outputDelta",
    "thread/status/changed",
    "thread/settings/updated",
    "thread/tokenUsage/updated",
    "thread/started",
    "thread/goal/updated",
    "thread/goal/cleared",
    "rawResponse/completed",
    "error",
    "thread/realtime/error",
    "mcpServer/event/stream/notification",
    "mcpServer/startupStatus/updated",
    "item/tool/requestUserInput",
    "mcpServer/elicitation/request",
    "item/permissions/requestApproval",
    "item/tool/call",
    "account/chatgptAuthTokens/refresh",
    "attestation/generate",
  ].includes(method);
}
