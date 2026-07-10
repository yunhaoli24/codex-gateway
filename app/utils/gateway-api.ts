import type { NitroFetchOptions, NitroFetchRequest } from "nitropack";
import { useAuthStore } from "@/stores/auth";

export function gatewayApi<T>(
  request: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {},
) {
  const auth = useAuthStore();
  auth.hydrate();
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (auth.token) {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  return $fetch<T>(request, {
    ...options,
    headers,
  });
}
