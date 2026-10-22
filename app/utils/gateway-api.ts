import type {
  AnyServerRouteMethod,
  TypedFetch,
  TypedFetchOptions,
  TypedFetchRequest,
} from "nuxt/app";
import { FetchError } from "ofetch";
import { useAuthStore } from "@/stores/auth";
import { gatewayErrorMessage } from "@/utils/gateway-error";

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

// Fetch does not expose browser upload progress. Use the native XHR upload contract only for
// multipart transfers; ordinary API calls stay on ofetch. A completed body transfer is not a
// completed remote SFTP write: callers keep that separate until the HTTP response arrives.
export function gatewayUpload(
  url: string,
  options: {
    body: FormData;
    signal: AbortSignal;
    onProgress: (loaded: number, total: number | null) => void;
    onUploaded: () => void;
  },
): Promise<unknown> {
  const auth = useAuthStore();
  auth.hydrate();
  const token = auth.token;
  return new Promise((resolve, reject) => {
    options.signal.throwIfAborted();
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.upload.onprogress = (event) =>
      options.onProgress(event.loaded, event.lengthComputable ? event.total : null);
    request.upload.onload = options.onUploaded;
    request.onload = () => {
      const response: unknown = request.response;
      if (request.status >= 200 && request.status < 300) {
        resolve(response);
      } else {
        if (request.status === 401 && auth.token === token) auth.clearSession();
        reject(new Error(gatewayErrorMessage(response, `Upload failed (HTTP ${request.status})`)));
      }
    };
    request.onerror = () => reject(new TypeError("Network request failed"));
    request.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    request.onloadend = () => options.signal.removeEventListener("abort", abort);
    request.open("POST", url);
    request.responseType = "json";
    if (token !== "") request.setRequestHeader("authorization", `Bearer ${token}`);
    options.signal.addEventListener("abort", abort, { once: true });
    request.send(options.body);
  });
}
