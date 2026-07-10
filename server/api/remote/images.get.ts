import { extname } from "node:path";
import { createError, getValidatedQuery } from "h3";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { sendRemoteFile } from "../../utils/gateway/http/remote-file-response";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteImageSchema } from "../../utils/gateway/http/validation/remote";
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
    return await sendRemoteFile(event, host, query.path, {
      maxSize: MAX_REMOTE_IMAGE_BYTES,
      contentType: mimeType,
      previewKind: "document",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createError({ statusCode: 404, statusMessage: message || "Remote image not found" });
  }
});
