import type { AppServerTurnDisplayError } from "@/stores/gateway/errors";
import { MAX_SERVER_OVERLOADED_RETRIES, type Translate } from "./types";
import type { SubmittedTurnRequestState } from "@/stores/gateway-thread-turns";

export function buildRetryingMessage(t: Translate, attempt: number) {
  return t("app.appServerAutoRetrying", {
    attempt,
    max: MAX_SERVER_OVERLOADED_RETRIES,
  });
}

export function buildRetryExhaustedMessage(
  t: Translate,
  error: AppServerTurnDisplayError,
  retries: number,
) {
  return [t("app.appServerAutoRetryExhausted", { max: retries }), error.toDisplayMessage()]
    .filter(Boolean)
    .join("\n");
}

export function messageFromRetryFailure(
  t: Translate,
  request: SubmittedTurnRequestState,
  error: any,
) {
  const message =
    error?.data?.message ||
    error?.response?._data?.message ||
    error?.message ||
    (request.kind === "steer" ? t("app.sendSteerFailed") : t("app.sendMessageFailed"));
  if (request.retryCount < MAX_SERVER_OVERLOADED_RETRIES) {
    return message;
  }
  return [t("app.appServerAutoRetryExhausted", { max: MAX_SERVER_OVERLOADED_RETRIES }), message]
    .filter(Boolean)
    .join("\n");
}
