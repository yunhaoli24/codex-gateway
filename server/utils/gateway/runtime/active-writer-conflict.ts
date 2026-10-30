import { CodexRpcError } from "../http/errors";

const activeWriterMessage = /^thread [0-9a-f-]+ already has an active writer$/i;

export function isActiveWriterConflict(error: unknown): error is CodexRpcError {
  return (
    error instanceof CodexRpcError &&
    error.rpcCode === -32600 &&
    activeWriterMessage.test(error.message)
  );
}
