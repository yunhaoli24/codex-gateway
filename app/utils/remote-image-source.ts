/** Image bytes are authenticated by useAuthorizedObjectUrl, never by query-string credentials. */
export function remoteImageSource(hostId: number, path: string) {
  return `/api/remote/images?${new URLSearchParams({ hostId: String(hostId), path })}`;
}
