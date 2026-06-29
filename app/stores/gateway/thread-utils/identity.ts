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
  const payload = error?.data || error?.response?._data || error;
  const message =
    payload?.message ||
    payload?.statusMessage ||
    error?.statusMessage ||
    error?.message ||
    fallback;
  const details = payload?.details;
  if (!details || typeof details !== "object") {
    return message;
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
  return context.length ? `${message}\n${context.join(" · ")}` : message;
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

function labelValue(label: string, value: unknown) {
  const text = stringFromDetail(value);
  return text ? `${label}: ${text}` : null;
}

function sshTarget(details: Record<string, unknown>) {
  const host = stringFromDetail(details.sshHost);
  if (!host) {
    return null;
  }
  const user = stringFromDetail(details.sshUser);
  const port = stringFromDetail(details.sshPort);
  return `${user ? `${user}@` : ""}${host}${port ? `:${port}` : ""}`;
}

function stringFromDetail(value: unknown) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
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
