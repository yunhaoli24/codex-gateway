import { STALE_THREAD_CURSOR_ERROR_CODE } from "~~/shared/gateway-errors";

export function isStaleThreadCursorFetchError(error: unknown) {
  const payload = (error as any)?.data || (error as any)?.response?._data || error;
  return payload?.code === STALE_THREAD_CURSOR_ERROR_CODE;
}
