import { createError, getHeader, getValidatedQuery, readRawBody } from "h3";
import type { RemoteFileWriteResult } from "~~/shared/types";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { remoteFileEtag } from "../../utils/gateway/http/remote-file-response";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteFileSchema } from "../../utils/gateway/http/validation/remote";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { hostStore } from "../../utils/gateway/state/hosts";

const MAX_EDITABLE_FILE_BYTES = 5 * 1024 * 1024;

export default defineGatewayEventHandler(async (event): Promise<RemoteFileWriteResult> => {
  const query = await getValidatedQuery(event, (value) => remoteFileSchema.parse(value));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "remote/files.put", {
    ...hostLogContext(host),
    path: query.path,
  });

  const rawBody = await readRawBody(event, false);
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? "", "utf8");
  if (body.byteLength > MAX_EDITABLE_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Editable file exceeds 5 MiB" });
  }

  const force = getHeader(event, "x-codex-force-overwrite") === "true";
  const expectedEtag = getHeader(event, "if-match");
  const current = await remoteFiles.statRemoteFile(host, query.path, {
    maxSize: Number.MAX_SAFE_INTEGER,
  });
  const currentEtag = remoteFileEtag(current.size, current.modifiedAt);
  if (!force && (!expectedEtag || expectedEtag !== currentEtag)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Remote file changed since it was opened",
      data: {
        code: "remoteFileConflict",
        remoteEtag: currentEtag,
        remoteLastModified: new Date(current.modifiedAt).toUTCString(),
      },
    });
  }

  const written = await remoteFiles.writeTextFile(host, query.path, body);
  return {
    etag: remoteFileEtag(written.size, written.modifiedAt),
    lastModified: new Date(written.modifiedAt).toUTCString(),
    size: written.size,
  };
});
