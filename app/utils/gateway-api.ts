import type {
  AnyServerRouteMethod,
  TypedFetch,
  TypedFetchOptions,
  TypedFetchRequest,
} from "nuxt/app";
import { FetchError } from "ofetch";
import { useAuthStore } from "@/stores/auth";

export function gatewayApi<T>(
  request: TypedFetchRequest,
  options: TypedFetchOptions<TypedFetchRequest, AnyServerRouteMethod> = {},
) {
  const auth = useAuthStore();
  auth.hydrate();
  const headers = new Headers(options.headers);
  if (auth.token !== "") {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  // Use Nuxt's browser contract explicitly: tooling also loads Nitro's global $fetch declaration,
  // whose third generic parameter is options rather than Nuxt's HTTP method.
  const fetchApi: TypedFetch = $fetch;
  return fetchApi<T, TypedFetchRequest, AnyServerRouteMethod>(request, {
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
