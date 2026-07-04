export interface GatewayRouteSelection {
  hostId: number | null;
  projectId: number | null;
  threadId: string | null;
}

const LAST_OPEN_THREAD_STORAGE_KEY = "codex-gateway-last-open-thread";

function numberFromQuery(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringFromQuery(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function readGatewayRouteSelection(): GatewayRouteSelection {
  if (!import.meta.client) {
    return { hostId: null, projectId: null, threadId: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    hostId: numberFromQuery(params.get("hostId")),
    projectId: numberFromQuery(params.get("projectId")),
    threadId: stringFromQuery(params.get("threadId")),
  };
}

export function hasGatewayRouteSelection(selection = readGatewayRouteSelection()) {
  return Boolean(selection.hostId || selection.projectId || selection.threadId);
}

export function writeGatewayRouteSelection(
  selection: Partial<GatewayRouteSelection>,
  options: { replace?: boolean } = { replace: true },
) {
  if (!import.meta.client) {
    return;
  }

  const url = new URL(window.location.href);
  setRouteParam(url, "hostId", selection.hostId);
  setRouteParam(url, "projectId", selection.projectId);
  setRouteParam(url, "threadId", selection.threadId);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) {
    return;
  }

  const method = options.replace === false ? "pushState" : "replaceState";
  window.history[method](window.history.state, "", nextUrl);
}

export function readGatewayLastOpenThreadSelection(): GatewayRouteSelection {
  if (!import.meta.client) {
    return { hostId: null, projectId: null, threadId: null };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_OPEN_THREAD_STORAGE_KEY) || "null");
    return {
      hostId: positiveNumber(parsed?.hostId),
      projectId: positiveNumber(parsed?.projectId),
      threadId: nonEmptyString(parsed?.threadId),
    };
  } catch {
    return { hostId: null, projectId: null, threadId: null };
  }
}

export function writeGatewayLastOpenThreadSelection(selection: GatewayRouteSelection) {
  if (!import.meta.client) {
    return;
  }
  localStorage.setItem(
    LAST_OPEN_THREAD_STORAGE_KEY,
    JSON.stringify({
      hostId: selection.hostId,
      projectId: selection.projectId,
      threadId: selection.threadId,
    }),
  );
}

function setRouteParam(url: URL, key: string, value: string | number | null | undefined) {
  if (value == null || value === "") {
    url.searchParams.delete(key);
    return;
  }
  url.searchParams.set(key, String(value));
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
