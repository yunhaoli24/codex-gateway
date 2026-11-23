import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { createError, getValidatedQuery } from "h3";
import type { WorkspaceUploadResult } from "~~/shared/types";
import {
  defineGatewayEventHandler,
  hostLogContext,
  logGatewayApiError,
} from "../../utils/gateway/http/errors";
import { streamMultipartUploads } from "../../utils/gateway/http/multipart-uploads";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteFileSchema } from "../../utils/gateway/http/validation/remote";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { isWithinDirectory } from "../../utils/gateway/infra/files/workspace-paths";
import {
  resolveUploadDirectory,
  uploadWorkspaceFile,
} from "../../utils/gateway/infra/files/workspace-uploads";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

const querySchema = remoteFileSchema.extend({ rootPath: remoteFileSchema.shape.path });

export default defineGatewayEventHandler(async (event): Promise<WorkspaceUploadResult> => {
  const query = await getValidatedQuery(event, (value) => querySchema.parse(value));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  const project = projectStore
    .list(host.id)
    .filter((project) => isWithinDirectory(project.remotePath, query.rootPath))
    .sort(
      (left, right) =>
        posix.normalize(right.remotePath).length - posix.normalize(left.remotePath).length,
    )[0];
  if (!project || !isWithinDirectory(query.rootPath, query.path)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Upload destination is outside the project",
    });
  }
  const sftp = await sshConnections.sftp(host);
  const directory = await resolveUploadDirectory(sftp, project.remotePath, query.path);
  const tempDir = await mkdtemp(join(tmpdir(), "codex-gateway-upload-"));
  try {
    const parts = await streamMultipartUploads(event, tempDir);
    const files: WorkspaceUploadResult["files"] = [];
    for (const part of parts) {
      try {
        const path = await uploadWorkspaceFile(sftp, part.localPath, directory, part.originalName);
        files.push({ name: part.originalName, path });
      } catch (error) {
        logGatewayApiError(
          "remote/uploads",
          { ...hostLogContext(host), path: query.path, name: part.originalName },
          error,
        );
        files.push({
          name: part.originalName,
          error:
            error instanceof Error && "statusCode" in error && error.statusCode === 409
              ? "remoteFileAlreadyExists"
              : "remoteFileUploadFailed",
        });
      }
    }
    return { files };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
