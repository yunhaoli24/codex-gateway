import type { ErrorMessageLabels } from "./thread-utils/identity";
import { gatewayErrorMessage, gatewayErrorPayload } from "@/utils/gateway-error";

export type GatewayErrorKind = "appServerTurn" | "http" | "rpc" | "realtime" | "unknown";

export interface GatewayErrorContext {
  hostId?: number | null;
  projectId?: number | null;
  threadId?: string | null;
  turnId?: string | null;
}

export abstract class GatewayDisplayError extends Error {
  abstract readonly kind: GatewayErrorKind;
  readonly context: GatewayErrorContext;

  protected constructor(message: string, context: GatewayErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
  }

  toDisplayMessage() {
    return this.message;
  }
}

export class AppServerTurnDisplayError extends GatewayDisplayError {
  readonly kind = "appServerTurn";

  constructor(
    message: string,
    context: GatewayErrorContext,
    readonly willRetry: boolean,
    readonly code: string | null,
    readonly additionalDetails: string | null,
  ) {
    super(message, context);
  }
}

export class UnknownGatewayDisplayError extends GatewayDisplayError {
  readonly kind = "unknown";

  constructor(message: string, context: GatewayErrorContext = {}) {
    super(message, context);
  }
}

export const APP_SERVER_SERVER_OVERLOADED_CODE = "serverOverloaded";
export const APP_SERVER_SERVER_OVERLOADED_MESSAGE =
  "Selected model is at capacity. Please try a different model.";
export const APP_SERVER_RPC_OVERLOADED_MESSAGE = "Server overloaded; retry later.";

export function appServerTurnErrorFromNotification(
  params: Record<string, any>,
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  const turnError = params.error || {};
  const message = stringValue(turnError.message) || t("app.appServerError");
  const additionalDetails = stringValue(turnError.additionalDetails);
  const code = codexErrorCode(turnError.codexErrorInfo);
  const willRetry = params.willRetry === true;
  const display = [
    message,
    code ? t("app.appServerErrorCode", { code }) : null,
    additionalDetails,
    willRetry ? t("app.appServerWillRetry") : t("app.appServerWillNotRetry"),
  ]
    .filter(Boolean)
    .join("\n");

  return new AppServerTurnDisplayError(
    display,
    {
      threadId: stringValue(params.threadId),
      turnId: stringValue(params.turnId),
    },
    willRetry,
    code,
    additionalDetails,
  );
}

export function unknownGatewayErrorFromError(
  error: any,
  fallback: string,
  labels: ErrorMessageLabels,
) {
  const payload = gatewayErrorPayload(error);
  const message = gatewayErrorMessage(error, fallback);
  const details = payload?.details;
  if (!details || typeof details !== "object") {
    return new UnknownGatewayDisplayError(message);
  }

  const context = [
    labelValue(labels.scope, details.scope),
    labelValue(labels.host, details.hostName),
    labelValue(labels.ssh, sshTarget(details)),
    labelValue(labels.auth, details.authMode),
    labelValue(
      labels.password,
      details.hasPassword === true
        ? labels.passwordConfigured
        : details.hasPassword === false
          ? labels.passwordMissing
          : null,
    ),
    labelValue(
      labels.proxy,
      details.hasProxy === true
        ? labels.proxyEnabled
        : details.hasProxy === false
          ? labels.proxyNone
          : null,
    ),
  ].filter(Boolean);
  return new UnknownGatewayDisplayError(
    context.length ? `${message}\n${context.join(" · ")}` : message,
  );
}

function codexErrorCode(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const [key] = Object.keys(value);
  return key || null;
}

function labelValue(label: string, value: unknown) {
  const text = stringValue(value);
  return text ? `${label}: ${text}` : null;
}

function sshTarget(details: Record<string, unknown>) {
  const host = stringValue(details.sshHost);
  if (!host) {
    return null;
  }
  const user = stringValue(details.sshUser);
  const port = stringValue(details.sshPort);
  return `${user ? `${user}@` : ""}${host}${port ? `:${port}` : ""}`;
}

function stringValue(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function isServerOverloadedAppError(error: unknown) {
  return (
    error instanceof AppServerTurnDisplayError && error.code === APP_SERVER_SERVER_OVERLOADED_CODE
  );
}

export function isServerOverloadedRequestError(error: any) {
  const message = gatewayErrorMessage(error, "");
  return (
    message === APP_SERVER_SERVER_OVERLOADED_MESSAGE ||
    message === APP_SERVER_RPC_OVERLOADED_MESSAGE
  );
}
