export const STALE_THREAD_CURSOR_ERROR_CODE = "staleThreadCursor";
export const STALE_THREAD_CURSOR_ERROR_MESSAGE = "invalid cursor: anchor turn is no longer present";

export function isStaleThreadCursorErrorLike(error: unknown) {
  const candidate = error as {
    message?: unknown;
    rpcCode?: unknown;
    rpcMethod?: unknown;
  };
  return (
    candidate?.rpcMethod === "thread/turns/list" &&
    candidate?.rpcCode === -32600 &&
    candidate?.message === STALE_THREAD_CURSOR_ERROR_MESSAGE
  );
}
