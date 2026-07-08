import { extname } from "node:path";
import { createError, getValidatedQuery, setResponseHeader } from "h3";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteFileSchema } from "../../utils/gateway/http/validation/remote";
import { hostStore } from "../../utils/gateway/state/hosts";

const MAX_REMOTE_FILE_BYTES = 80 * 1024 * 1024;

const mimeTypes: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".yaml": "application/yaml; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
};

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => remoteFileSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "remote/files", {
    ...hostLogContext(host),
    path: query.path,
  });

  try {
    const file = await remoteFiles.readRemoteFile(host, query.path, {
      maxSize: MAX_REMOTE_FILE_BYTES,
    });
    setResponseHeader(event, "content-type", mimeTypeForPath(query.path));
    setResponseHeader(event, "content-length", file.size);
    setResponseHeader(event, "cache-control", "private, max-age=60");
    setResponseHeader(event, "x-content-type-options", "nosniff");
    return file.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.includes("exceeds") ? 413 : 404;
    throw createError({
      statusCode,
      statusMessage: message || "Remote file not found",
    });
  }
});

function mimeTypeForPath(path: string) {
  return mimeTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
}
