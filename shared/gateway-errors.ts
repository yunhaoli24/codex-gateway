import { recordFromUnknown } from "./utils/records";

export const STALE_THREAD_CURSOR_ERROR_CODE = "staleThreadCursor";
export const APP_SERVER_SHUTTING_DOWN_ERROR_CODE = "serverShuttingDown";
const STALE_THREAD_CURSOR_ERROR_PREFIX = "invalid thread timeline cursor";

export function isAppServerShuttingDownError(error: unknown) {
  const candidate = recordFromUnknown(error);
  // -32600 also covers unrelated invalid requests. Only the official structured reason marks
  // graceful shutdown; message matching would misclassify failures and tempt unsafe send retries.
  return (
    candidate?.rpcCode === -32600 &&
    recordFromUnknown(candidate.rpcData)?.reason === APP_SERVER_SHUTTING_DOWN_ERROR_CODE
  );
}

export function isStaleThreadCursorErrorLike(error: unknown) {
  const candidate = recordFromUnknown(error);
  // Error.message is intentionally non-enumerable, so Zod's object parser cannot carry it into
  // the plain record. Keep Zod for the transport-specific enumerable fields and use the standard
  // Error contract for the built-in message instead of weakening the RPC discriminator.
  const candidateMessage = candidate?.message;
  const message =
    error instanceof Error
      ? error.message
      : typeof candidateMessage === "string"
        ? candidateMessage
        : null;
  return (
    candidate?.rpcMethod === "thread/timeline/list" &&
    candidate?.rpcCode === -32600 &&
    // Timeline cursors are opaque and can become invalid after a new rollout is appended. Classify
    // the protocol error by method, JSON-RPC code and stable prefix so the browser can restart its
    // current timeline page without exposing an upstream implementation detail.
    message?.startsWith(STALE_THREAD_CURSOR_ERROR_PREFIX) === true
  );
}
