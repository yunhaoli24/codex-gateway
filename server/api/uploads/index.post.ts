import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { getValidatedQuery, readMultipartFormData } from "h3";
import type { UploadResult } from "~~/shared/types";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { requireRecord, uploadQuerySchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event): Promise<UploadResult> => {
  const query = await getValidatedQuery(event, (body) => uploadQuerySchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  const form = await readMultipartFormData(event);
  const parts =
    form?.filter((part) => part.name === "files" && part.filename && part.data.length) ?? [];
  if (!parts.length) {
    return { files: [] };
  }
  const remoteRoot = await remoteFiles.createUploadDirectory(host);
  const tempDir = await mkdtemp(join(tmpdir(), "codex-gateway-upload-"));

  try {
    const files = [];
    for (const part of parts) {
      const originalName = basename(part.filename || "upload.bin");
      const extension = extname(originalName);
      const safeName = `${randomUUID()}${extension}`;
      const localPath = join(tempDir, safeName);
      const remotePath = `${remoteRoot}/${safeName}`;
      await writeFile(localPath, part.data);
      await remoteFiles.uploadFile(host, localPath, remotePath);
      files.push({
        name: originalName,
        path: remotePath,
        mimeType: part.type || null,
        size: part.data.length,
        isImage: Boolean(part.type?.startsWith("image/")),
      });
    }
    return { files };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
