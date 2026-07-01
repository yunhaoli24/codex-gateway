import { unknownGatewayErrorFromError } from "../errors";

export interface ErrorMessageLabels {
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
  error: any,
  fallback: string,
  labels: ErrorMessageLabels = defaultErrorLabels,
) {
  return unknownGatewayErrorFromError(error, fallback, labels).toDisplayMessage();
}

export function errorMessageLabels(t: (key: string) => string): ErrorMessageLabels {
  return {
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
  return hostId && threadId ? pinnedKey(hostId, threadId) : null;
}

export function threadIdFromParams(params: any) {
  return params?.threadId;
}

export function titleForThread(thread: any) {
  return thread?.title || thread?.name || thread?.preview || thread?.id || "Untitled";
}

export function sortThreads(threads: any[]) {
  return [...threads].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return (
      Number(right.recencyAt || right.updatedAt || 0) -
      Number(left.recencyAt || left.updatedAt || 0)
    );
  });
}
