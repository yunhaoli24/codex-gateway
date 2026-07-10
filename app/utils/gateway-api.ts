import type { NitroFetchOptions, NitroFetchRequest } from "nitropack";
import { useAuthStore } from "@/stores/auth";
import {
  captureGatewayConfigRevision,
  currentGatewayConfigRevision,
  GatewayConfigConflictError,
} from "./gateway-config-revision";
import { gatewayErrorPayload } from "./gateway-error";

export async function gatewayApi<T>(
  request: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {},
) {
  const auth = useAuthStore();
  auth.hydrate();
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (auth.token) {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  const response = await $fetch.raw<T>(request, {
    ...options,
    headers,
  });
  captureGatewayConfigRevision(response.headers);
  return response._data as T;
}

export async function gatewayConfigApi<T>(
  request: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {},
) {
  const revision = currentGatewayConfigRevision();
  if (revision === null) {
    throw new GatewayConfigConflictError();
  }
  const headers = new Headers(options.headers as HeadersInit | undefined);
  headers.set("if-match", `"${revision}"`);
  try {
    return await gatewayApi<T>(request, { ...options, headers });
  } catch (error: any) {
    if (gatewayErrorPayload(error).code === "configConflict") {
      throw new GatewayConfigConflictError();
    }
    throw error;
  }
}
