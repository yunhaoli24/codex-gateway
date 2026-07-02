import {
  clearThreadTerminalProcess,
  rememberThreadTerminalProcess,
} from "../thread-runtime/projector";
import type { GatewayStoreContext } from "../types";

interface ActiveTerminalProcessInput {
  hostId: number;
  threadId: string;
  turnId: string;
  itemId: string;
  processId: string;
}

interface CompletedTerminalProcessInput {
  hostId: number;
  threadId: string;
  turnId: string;
  itemId: string;
}

export function rememberActiveTerminalProcess(
  ctx: GatewayStoreContext,
  input: ActiveTerminalProcessInput,
) {
  rememberThreadTerminalProcess(ctx, input.hostId, input.threadId, {
    turnId: input.turnId,
    itemId: input.itemId,
    processId: input.processId,
  });
}

export function clearActiveTerminalProcess(
  ctx: GatewayStoreContext,
  input: CompletedTerminalProcessInput,
) {
  clearThreadTerminalProcess(ctx, input.hostId, input.threadId, {
    turnId: input.turnId,
    itemId: input.itemId,
  });
}
