import { STALE_THREAD_CURSOR_ERROR_CODE } from "~~/shared/gateway-errors";
import { gatewayErrorPayload } from "@/utils/gateway-error";

export function isStaleThreadCursorError(error: unknown) {
  const payload = gatewayErrorPayload(error);
  return (
    payload.code === STALE_THREAD_CURSOR_ERROR_CODE ||
    payload.details?.code === STALE_THREAD_CURSOR_ERROR_CODE
  );
}
