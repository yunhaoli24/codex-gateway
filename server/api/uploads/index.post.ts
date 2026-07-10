import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getValidatedQuery } from "h3";
import type { UploadResult } from "~~/shared/types";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { uploadQuerySchema } from "../../utils/gateway/http/validation/uploads";
import { streamMultipartUploads } from "../../utils/gateway/http/multipart-uploads";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event): Promise<UploadResult> => {
  const query = await getValidatedQuery(event, (body) => uploadQuerySchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  const tempDir = await mkdtemp(join(tmpdir(), "codex-gateway-upload-"));

  try {
    const parts = await streamMultipartUploads(event, tempDir);
    if (!parts.length) {
      return { files: [] };
    }
    const remoteRoot = await remoteFiles.createUploadDirectory(host);
    const files = [];
    for (const part of parts) {
      const remotePath = `${remoteRoot}/${part.safeName}`;
      await remoteFiles.uploadFile(host, part.localPath, remotePath);
      files.push({
        name: part.originalName,
        path: remotePath,
        mimeType: part.mimeType,
        size: part.size,
        isImage: Boolean(part.mimeType?.startsWith("image/")),
      });
    }
    return { files };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
