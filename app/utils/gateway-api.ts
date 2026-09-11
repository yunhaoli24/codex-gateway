import type { NitroFetchOptions, NitroFetchRequest } from "nitropack";
import { FetchError } from "ofetch";
import { useAuthStore } from "@/stores/auth";

export function gatewayApi<T>(
  request: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {},
) {
  const auth = useAuthStore();
  auth.hydrate();
  const headers = new Headers(options.headers);
  if (auth.token !== "") {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  return $fetch<T>(request, {
    ...options,
    headers,
  }).catch((error: unknown) => {
    if (isUnauthorizedResponse(error)) auth.clearSession();
    throw error;
  });
}

function isUnauthorizedResponse(error: unknown) {
  return error instanceof FetchError && error.response?.status === 401;
}
