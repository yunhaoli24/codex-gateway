export interface GatewayRouteSelection {
  hostId: number | null;
  cwd: string | null;
  threadId: string | null;
}

function numberFromQuery(value: string | null) {
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringFromQuery(value: string | null) {
  return trimmedOrNull(value);
}

export function readGatewayRouteSelection(): GatewayRouteSelection {
  if (!import.meta.client) {
    return { hostId: null, cwd: null, threadId: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    hostId: numberFromQuery(params.get("hostId")),
    cwd: stringFromQuery(params.get("cwd")),
    threadId: stringFromQuery(params.get("threadId")),
  };
}

export function hasGatewayRouteSelection(selection = readGatewayRouteSelection()) {
  return selection.hostId !== null || selection.cwd !== null || selection.threadId !== null;
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
  url.searchParams.delete("projectId");
  setRouteParam(url, "cwd", selection.cwd);
  setRouteParam(url, "threadId", selection.threadId);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) {
    return;
  }

  // Nuxt's built-in update reload uses the router's fullPath. Writing browser history directly
  // leaves that route stale and can reopen the previous conversation after an automatic reload.
  // Let the official router own URL updates now that the workspace is a Nuxt page.
  const router = useRouter();
  if (options.replace === false) void router.push(nextUrl);
  else void router.replace(nextUrl);
}

function setRouteParam(url: URL, key: string, value: string | number | null | undefined) {
  if (value == null || value === "") {
    url.searchParams.delete(key);
    return;
  }
  url.searchParams.set(key, String(value));
}
import { trimmedOrNull } from "~~/shared/utils/strings";
