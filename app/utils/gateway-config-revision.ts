import { GATEWAY_CONFIG_REVISION_HEADER } from "~~/shared/config";

const STORAGE_KEY = "codex-gateway-config-revision";

export class GatewayConfigConflictError extends Error {
  constructor(message = "Configuration changed in another browser tab") {
    super(message);
    this.name = "GatewayConfigConflictError";
  }
}

export function currentGatewayConfigRevision() {
  if (!import.meta.client) {
    return null;
  }
  const value = sessionStorage.getItem(STORAGE_KEY);
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  return Number(value);
}

export function captureGatewayConfigRevision(headers: Headers) {
  const value = headers.get(GATEWAY_CONFIG_REVISION_HEADER);
  if (!import.meta.client || !value || !/^\d+$/.test(value)) {
    return;
  }
  const nextRevision = Number(value);
  const currentRevision = currentGatewayConfigRevision();
  if (currentRevision === null || nextRevision > currentRevision) {
    sessionStorage.setItem(STORAGE_KEY, value);
  }
}

export function clearGatewayConfigRevision() {
  if (import.meta.client) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
