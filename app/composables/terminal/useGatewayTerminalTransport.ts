import {
  closeTerminalSession,
  type GatewayTerminalTransportContext,
  openTerminalSession,
  resizeTerminal,
  sendTerminalInput,
} from "@/stores/gateway-terminal/transport";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels } from "@/stores/gateway/thread-utils/identity";

export function useGatewayTerminalTransport() {
  const gateway = useGatewayStore();
  const { t } = useI18n();
  const ctx: GatewayTerminalTransportContext = {
    t,
    get errorLabels() {
      return errorMessageLabels(t);
    },
    setError: gateway.setError,
  };
  return {
    openTerminal: (input: Parameters<typeof openTerminalSession>[1]) =>
      openTerminalSession(ctx, input),
    sendTerminalInput: (sessionId: string, data: string) => sendTerminalInput(ctx, sessionId, data),
    resizeTerminal: (sessionId: string, cols: number, rows: number) =>
      resizeTerminal(ctx, sessionId, cols, rows),
    closeTerminal: (sessionId: string) => closeTerminalSession(ctx, sessionId),
  };
}
