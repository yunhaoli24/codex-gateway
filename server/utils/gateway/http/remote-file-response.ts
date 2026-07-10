import type { H3Event } from "h3";
import { getHeader, sendStream, setResponseHeader, setResponseStatus } from "h3";
import { remoteFiles } from "../infra/host-services";
import type { HostWithSecret } from "../infra/ssh-types";

export async function sendRemoteFile(
  event: H3Event,
  host: HostWithSecret,
  path: string,
  options: { maxSize: number; contentType: string },
) {
  const metadata = await remoteFiles.statRemoteFile(host, path, {
    maxSize: options.maxSize,
  });
  const etag = remoteFileEtag(metadata.size, metadata.modifiedAt);
  setResponseHeader(event, "etag", etag);
  setResponseHeader(event, "last-modified", new Date(metadata.modifiedAt).toUTCString());
  setResponseHeader(event, "cache-control", "private, no-cache");
  setResponseHeader(event, "x-content-type-options", "nosniff");
  if (getHeader(event, "if-none-match") === etag) {
    setResponseStatus(event, 304);
    return null;
  }
  const file = await remoteFiles.openRemoteFile(host, metadata);
  setResponseHeader(event, "content-type", options.contentType);
  setResponseHeader(event, "content-length", file.size);
  return sendStream(event, file.stream);
}

function remoteFileEtag(size: number, modifiedAt: number) {
  return `W/"${size.toString(16)}-${Math.trunc(modifiedAt).toString(16)}"`;
}
