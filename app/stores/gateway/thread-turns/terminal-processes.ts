import { pinnedKey } from "../thread-utils/identity";
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
  const key = pinnedKey(input.hostId, input.threadId);
  ctx.state.activeTerminalProcessByThreadKey = {
    ...ctx.state.activeTerminalProcessByThreadKey,
    [key]: {
      turnId: input.turnId,
      itemId: input.itemId,
      processId: input.processId,
    },
  };
  ctx.setThreadStatus(input.hostId, input.threadId, "running", { turnId: input.turnId });
}

export function clearActiveTerminalProcess(
  ctx: GatewayStoreContext,
  input: CompletedTerminalProcessInput,
) {
  const key = pinnedKey(input.hostId, input.threadId);
  const active = ctx.state.activeTerminalProcessByThreadKey[key];
  if (!active || active.turnId !== input.turnId || active.itemId !== input.itemId) {
    return;
  }
  const { [key]: _removedProcess, ...remainingProcesses } =
    ctx.state.activeTerminalProcessByThreadKey;
  ctx.state.activeTerminalProcessByThreadKey = remainingProcesses;

  const { [key]: _removedTurn, ...remainingTurns } = ctx.state.activeTurnIdsByThreadKey;
  ctx.state.activeTurnIdsByThreadKey = remainingTurns;
  ctx.setThreadStatus(input.hostId, input.threadId, "completed");
}
