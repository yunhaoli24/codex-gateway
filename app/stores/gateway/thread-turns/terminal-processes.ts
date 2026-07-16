import {
  clearThreadTerminalProcess,
  rememberThreadTerminalProcess,
} from "../thread-runtime/projector";

export function rememberActiveTerminalProcess(input: {
  hostId: number;
  threadId: string;
  turnId: string;
  itemId: string;
  processId: string;
}) {
  rememberThreadTerminalProcess(input.hostId, input.threadId, input);
}

export function clearActiveTerminalProcess(input: {
  hostId: number;
  threadId: string;
  turnId: string;
  itemId: string;
}) {
  clearThreadTerminalProcess(input.hostId, input.threadId, input);
}
