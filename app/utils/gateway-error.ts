import { FetchError } from "ofetch";
import { recordFromUnknown } from "~~/shared/utils/records";
import { firstNonEmptyString } from "~~/shared/utils/strings";
import { APP_SERVER_SHUTTING_DOWN_ERROR_CODE } from "~~/shared/gateway-errors";

export interface GatewayErrorPayload {
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  statusCode?: number;
  statusMessage?: string;
}

export function gatewayErrorPayload(error: unknown): GatewayErrorPayload {
  // ofetch exposes response payloads through FetchError.data getters. Converting the Error to a
  // plain record first drops those non-enumerable accessors, so inspect the typed transport error
  // before falling back to generic SSH, RPC, and browser errors.
  const fetchData = error instanceof FetchError ? recordFromUnknown(error.data) : null;
  const root = recordFromUnknown(error);
  const response = recordFromUnknown(root?.response);
  const candidates = [
    fetchData,
    recordFromUnknown(response?._data),
    recordFromUnknown(root?.data),
    root,
  ];
  const payload = candidates.find(
    (candidate) =>
      candidate !== null &&
      (typeof candidate.message === "string" ||
        typeof candidate.statusMessage === "string" ||
        typeof candidate.code === "string" ||
        recordFromUnknown(candidate.details) !== null),
  );
  return payload ?? {};
}

export function gatewayErrorMessage(
  error: unknown,
  fallback: string,
  labels?: { serverShuttingDown: string },
) {
  const payload = gatewayErrorPayload(error);
  if (
    labels !== undefined &&
    (payload.code ?? payload.details?.code) === APP_SERVER_SHUTTING_DOWN_ERROR_CODE
  ) {
    return labels.serverShuttingDown;
  }
  const root = recordFromUnknown(error);
  return (
    firstNonEmptyString([
      payload.message,
      payload.statusMessage,
      // Error.message is non-enumerable; Zod's record projection only preserves custom fields.
      // Read the native Error contract here so every caller retains the SSH/RPC/WS failure reason.
      error instanceof Error
        ? error.message
        : typeof root?.message === "string"
          ? root.message
          : null,
    ]) ?? fallback
  );
}
