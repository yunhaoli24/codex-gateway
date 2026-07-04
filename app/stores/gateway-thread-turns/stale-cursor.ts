import { STALE_THREAD_CURSOR_ERROR_CODE } from "~~/shared/gateway-errors";

export function isStaleThreadCursorError(error: unknown) {
  const payload = (error as any)?.data || (error as any)?.response?._data || error;
  return (
    payload?.code === STALE_THREAD_CURSOR_ERROR_CODE ||
    payload?.details?.code === STALE_THREAD_CURSOR_ERROR_CODE
  );
}
