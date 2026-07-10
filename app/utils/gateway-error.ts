export interface GatewayErrorPayload {
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  statusCode?: number;
  statusMessage?: string;
}

export function gatewayErrorPayload(error: any): GatewayErrorPayload {
  const candidates = [error?.response?._data, error?.data, error];
  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        (typeof candidate.message === "string" ||
          typeof candidate.statusMessage === "string" ||
          typeof candidate.code === "string" ||
          (candidate.details && typeof candidate.details === "object")),
    ) ?? {}
  );
}

export function gatewayErrorMessage(error: any, fallback: string) {
  const payload = gatewayErrorPayload(error);
  return payload.message || payload.statusMessage || error?.message || fallback;
}
