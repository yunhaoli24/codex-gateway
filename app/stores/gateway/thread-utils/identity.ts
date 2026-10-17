import type { GatewayThread } from "~~/shared/types";
import { firstNonEmptyString } from "~~/shared/utils/strings";
import { unknownGatewayErrorFromError } from "../errors";

export interface ErrorMessageLabels {
  serverShuttingDown: string;
  scope: string;
  host: string;
  ssh: string;
  auth: string;
  password: string;
  passwordConfigured: string;
  passwordMissing: string;
  proxy: string;
  proxyEnabled: string;
  proxyNone: string;
}

const defaultErrorLabels: ErrorMessageLabels = {
  serverShuttingDown:
    "Codex app-server is restarting. Wait for it to reconnect before trying again.",
  scope: "scope",
  host: "host",
  ssh: "ssh",
  auth: "auth",
  password: "password",
  passwordConfigured: "configured",
  passwordMissing: "missing",
  proxy: "proxy",
  proxyEnabled: "enabled",
  proxyNone: "none",
};

export function messageFromError(
  error: unknown,
  fallback: string,
  labels: ErrorMessageLabels = defaultErrorLabels,
) {
  return unknownGatewayErrorFromError(error, fallback, labels).toDisplayMessage();
}

export function errorMessageLabels(t: (key: string) => string): ErrorMessageLabels {
  return {
    serverShuttingDown: t("app.appServerShuttingDown"),
    scope: t("app.errorScope"),
    host: t("app.errorHost"),
    ssh: t("app.errorSsh"),
    auth: t("app.errorAuth"),
    password: t("app.errorPassword"),
    passwordConfigured: t("app.errorPasswordConfigured"),
    passwordMissing: t("app.errorPasswordMissing"),
    proxy: t("app.errorProxy"),
    proxyEnabled: t("app.errorProxyEnabled"),
    proxyNone: t("app.errorProxyNone"),
  };
}

export function pinnedKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

export function selectedThreadKey(hostId: number | null, threadId: string | null) {
  return hostId !== null && threadId !== null && threadId !== ""
    ? pinnedKey(hostId, threadId)
    : null;
}

export function selectedThreadScope(hostId: number | null, threadId: string | null) {
  if (hostId === null || threadId === null || threadId === "") return null;
  return { hostId, threadId };
}

export function threadIdFromParams(params: Record<string, unknown>) {
  const value = params.threadId;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

export function titleForThread(
  thread:
    | {
        id?: string | number;
        threadId?: string | number;
        title?: string | null;
        name?: string | null;
        preview?: string | null;
      }
    | null
    | undefined,
) {
  if (thread === null || thread === undefined) return "Untitled";
  const label = firstNonEmptyString([thread.title, thread.name, thread.preview]);
  if (label !== null) return label;
  const identity = thread.id ?? thread.threadId;
  return identity === undefined ? "Untitled" : String(identity);
}

export function sortThreads(threads: GatewayThread[]) {
  return [...threads].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned === true ? -1 : 1;
    }
    return (
      Number(right.recencyAt ?? right.updatedAt ?? 0) -
      Number(left.recencyAt ?? left.updatedAt ?? 0)
    );
  });
}
