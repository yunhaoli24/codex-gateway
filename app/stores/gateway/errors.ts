import type { ErrorMessageLabels } from "./thread-utils/identity";
import type { MisalignmentErrorDetails } from "~~/shared/types";
import { gatewayErrorMessage, gatewayErrorPayload } from "@/utils/gateway-error";
import { recordFromUnknown } from "~~/shared/utils/records";

export type GatewayErrorKind = "appServerTurn" | "http" | "rpc" | "realtime" | "unknown";

export interface GatewayErrorContext {
  hostId?: number | null;
  cwd?: string | null;
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
  params: Record<string, unknown>,
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  const turnError = recordFromUnknown(params.error) ?? {};
  const message = stringValue(turnError.message) ?? t("app.appServerError");
  const additionalDetails = stringValue(turnError.additionalDetails);
  const code = codexErrorCode(turnError.codexErrorInfo);
  const willRetry = params.willRetry === true;
  const display = [
    message,
    code !== null ? t("app.appServerErrorCode", { code }) : null,
    additionalDetails,
    willRetry ? t("app.appServerWillRetry") : t("app.appServerWillNotRetry"),
  ]
    .filter((value): value is string => value !== null)
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

export function misalignmentDetailsFromNotification(
  params: Record<string, unknown>,
): MisalignmentErrorDetails | null {
  const error = recordFromUnknown(params.error);
  const details = recordFromUnknown(error?.misalignment);
  if (details === null) return null;
  const steerRecord = recordFromUnknown(details.steer);
  const steerMessage = stringValue(steerRecord?.message);
  return {
    errorType: stringValue(details.errorType),
    detailedExplanation: stringValue(details.detailedExplanation),
    steer: steerMessage === null ? null : { message: steerMessage },
    reviewTarget: stringValue(details.reviewTarget),
  };
}

export function unknownGatewayErrorFromError(
  error: unknown,
  fallback: string,
  labels: ErrorMessageLabels,
) {
  const payload = gatewayErrorPayload(error);
  const message = gatewayErrorMessage(error, fallback, labels);
  const details = payload?.details;
  if (details === null || typeof details !== "object") {
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
  ].filter((value): value is string => value !== null);
  return new UnknownGatewayDisplayError(
    context.length > 0 ? `${message}\n${context.join(" · ")}` : message,
  );
}

function codexErrorCode(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  const [key] = Object.keys(value);
  return key === undefined || key === "" ? null : key;
}

function labelValue(label: string, value: unknown) {
  const text = stringValue(value);
  return text === null ? null : `${label}: ${text}`;
}

function sshTarget(details: Record<string, unknown>) {
  const host = stringValue(details.sshHost);
  if (host === null) {
    return null;
  }
  const user = stringValue(details.sshUser);
  const port = stringValue(details.sshPort);
  return `${user === null ? "" : `${user}@`}${host}${port === null ? "" : `:${port}`}`;
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

export function isServerOverloadedRequestError(error: unknown) {
  const message = gatewayErrorMessage(error, "");
  return (
    message === APP_SERVER_SERVER_OVERLOADED_MESSAGE ||
    message === APP_SERVER_RPC_OVERLOADED_MESSAGE
  );
}
