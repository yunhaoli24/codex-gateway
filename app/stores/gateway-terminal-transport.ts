import type { TerminalSessionSnapshot } from "~~/shared/types";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import type { ErrorMessageLabels } from "./gateway/thread-utils/identity";
import { messageFromError } from "./gateway/thread-utils/identity";
import type { GatewayErrorContext } from "./gateway/errors";
import type { TerminalOpenInput } from "./gateway/types";

export interface GatewayTerminalTransportContext {
  t: (key: string, values?: Record<string, unknown>) => string;
  errorLabels: ErrorMessageLabels;
  setError: (message: string, context?: GatewayErrorContext) => void;
}

export async function openTerminalSession(
  ctx: GatewayTerminalTransportContext,
  input: TerminalOpenInput,
) {
  const terminalStore = useGatewayTerminalStore();
  try {
    const response = await useGatewayRealtimeStore().request<{ session: TerminalSessionSnapshot }>(
      (requestId) => ({
        type: "terminal.open",
        requestId,
        ...input,
        cols: input.cols ?? 80,
        rows: input.rows ?? 24,
      }),
      30_000,
    );
    terminalStore.upsertTerminalSession(response.session);
    terminalStore.activateTerminalTab(response.session.sessionId);
    return response.session;
  } catch (error: any) {
    ctx.setError(messageFromError(error, ctx.t("app.openTerminalFailed"), ctx.errorLabels), {
      hostId: input.hostId,
      projectId: input.projectId ?? null,
      threadId: input.threadId ?? null,
    });
    throw error;
  }
}

export function sendTerminalInput(
  _ctx: GatewayTerminalTransportContext,
  sessionId: string,
  data: string,
) {
  useGatewayRealtimeStore().send({ type: "terminal.input", sessionId, data });
}

export function resizeTerminal(
  _ctx: GatewayTerminalTransportContext,
  sessionId: string,
  cols: number,
  rows: number,
) {
  useGatewayRealtimeStore().send({ type: "terminal.resize", sessionId, cols, rows });
}

export async function closeTerminalSession(
  ctx: GatewayTerminalTransportContext,
  sessionId: string,
) {
  const terminalStore = useGatewayTerminalStore();
  terminalStore.removeTerminalSession(sessionId);
  await useGatewayRealtimeStore()
    .request((requestId) => ({
      type: "terminal.close",
      requestId,
      sessionId,
    }))
    .catch(() => null);
}
