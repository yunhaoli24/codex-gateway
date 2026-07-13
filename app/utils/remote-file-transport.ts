import type { RemoteDirectoryResult, RemoteFileWriteResult } from "~~/shared/types";
import { useAuthStore } from "@/stores/auth";
import { gatewayApi } from "@/utils/gateway-api";

export type RemoteFileResponse =
  | { changed: false }
  | {
      changed: true;
      blob: Blob;
      contentType: string;
      previewKind: "text" | "binary" | "document";
      etag: string | null;
      lastModified: string | null;
    };

export function listRemoteDirectory(hostId: number, path: string) {
  return gatewayApi<RemoteDirectoryResult>("/api/remote/directories", {
    query: { hostId, path },
  });
}

export function deleteRemoteFile(hostId: number, path: string) {
  return gatewayApi<{ deleted: true }>("/api/remote/files", {
    method: "DELETE",
    query: { hostId, path },
  });
}

export async function downloadRemoteFile(hostId: number, path: string) {
  const response = await fetchRemoteFile(hostId, path, null);
  if (!response.changed) {
    throw new Error("Remote file download returned no content");
  }
  return response.blob;
}

export async function fetchRemoteFile(
  hostId: number,
  path: string,
  etag: string | null,
): Promise<RemoteFileResponse> {
  const headers = authorizationHeaders();
  if (etag) {
    headers.set("if-none-match", etag);
  }
  const query = new URLSearchParams({ hostId: String(hostId), path });
  const response = await fetch(`/api/remote/files?${query.toString()}`, {
    headers,
    // ETag validation is explicit; the browser cache must not issue a second unauthenticated fetch.
    cache: "no-store",
  });
  if (response.status === 304) {
    return { changed: false };
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return {
    changed: true,
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || "",
    previewKind: responsePreviewKind(response),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export class RemoteFileConflictError extends Error {
  constructor() {
    super("Remote file changed since it was opened");
    this.name = "RemoteFileConflictError";
  }
}

export async function writeRemoteTextFile(
  hostId: number,
  path: string,
  text: string,
  etag: string | null,
  force = false,
) {
  const headers = authorizationHeaders();
  headers.set("content-type", "text/plain; charset=utf-8");
  if (etag) headers.set("if-match", etag);
  if (force) headers.set("x-codex-force-overwrite", "true");
  const query = new URLSearchParams({ hostId: String(hostId), path });
  const response = await fetch(`/api/remote/files?${query.toString()}`, {
    method: "PUT",
    headers,
    body: text,
  });
  if (response.status === 409) throw new RemoteFileConflictError();
  if (!response.ok) throw new Error(await responseErrorMessage(response));
  return (await response.json()) as RemoteFileWriteResult;
}

function responsePreviewKind(response: Response): "text" | "binary" | "document" {
  const value = response.headers.get("x-codex-file-preview-kind");
  if (value === "binary" || value === "document") {
    return value;
  }
  return "text";
}

function authorizationHeaders() {
  const auth = useAuthStore();
  auth.hydrate();
  if (!auth.token) {
    throw new Error("Authentication is required to read remote files");
  }
  const headers = new Headers();
  headers.set("authorization", `Bearer ${auth.token}`);
  return headers;
}

async function responseErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const body = JSON.parse(text) as { message?: unknown; statusMessage?: unknown };
      const message = body.message ?? body.statusMessage;
      if (typeof message === "string") return message;
    } catch {
      return text;
    }
  }
  return text || response.statusText || `HTTP ${response.status}`;
}
