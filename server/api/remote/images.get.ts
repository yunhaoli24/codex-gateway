import { extname } from "node:path";
import { createError, getValidatedQuery, setHeader } from "h3";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { remoteImageSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;

const imageMimeTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => remoteImageSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");

  const mimeType = imageMimeTypes[extname(query.path).toLowerCase()];
  if (!mimeType) {
    throw createError({ statusCode: 415, statusMessage: "Unsupported remote image type" });
  }

  try {
    const file = await remoteFiles.readRemoteFile(host, query.path, {
      maxSize: MAX_REMOTE_IMAGE_BYTES,
    });
    setHeader(event, "content-type", mimeType);
    setHeader(event, "content-length", String(file.size));
    setHeader(event, "cache-control", "private, max-age=60");
    setHeader(event, "x-content-type-options", "nosniff");
    return file.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createError({ statusCode: 404, statusMessage: message || "Remote image not found" });
  }
});
