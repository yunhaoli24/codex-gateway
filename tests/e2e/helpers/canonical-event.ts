import type { GatewayEvent } from "../../../shared/types";
import { codexProviderAdapter } from "../../../server/utils/gateway/agent/providers/codex/codex-provider";

export interface LiveNotificationFixture {
  id: number;
  hostId?: number;
  threadId: string;
  /** Raw Codex notification method (e.g. "item/started", "turn/completed"). */
  method: string;
  /** Raw Codex notification params, exactly as the app-server emits them. */
  params?: Record<string, unknown>;
  /** RPC request id — required for pending server-request notifications. */
  rpcId?: string | number;
  createdAt?: string;
}

/**
 * Build a canonical GatewayEvent from a Codex notification-style fixture.
 *
 * Routes through the real provider mapper so fixtures can never drift from
 * production mapping semantics — the same table the app-server feed uses.
 */
export function gatewayEventFromNotification(fixture: LiveNotificationFixture): GatewayEvent {
  const mapped = codexProviderAdapter.mapNotification({
    method: fixture.method,
    params: fixture.params ?? {},
    id: fixture.rpcId,
  });
  if (mapped.kind !== "event") {
    throw new Error(
      `E2E fixture notification "${fixture.method}" produced no canonical event; ` +
        "check the fixture shape against the provider mapper",
    );
  }
  return {
    id: fixture.id,
    hostId: fixture.hostId ?? 1,
    threadId: fixture.threadId,
    event: mapped.event,
    createdAt: fixture.createdAt ?? new Date().toISOString(),
  };
}
