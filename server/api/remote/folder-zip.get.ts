import { posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { getValidatedQuery, setResponseHeaders } from "h3";
import { z } from "zod";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteFileSchema } from "../../utils/gateway/http/validation/remote";
import { isWithinDirectory } from "../../utils/gateway/infra/files/workspace-paths";
import { openWorkspaceZip, outsideWorkspace } from "../../utils/gateway/infra/files/workspace-zip";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

const absolutePath = z.string().startsWith("/");
const querySchema = remoteFileSchema.extend({ path: absolutePath, rootPath: absolutePath });

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (value) => querySchema.parse(value));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "remote/folder-zip", {
    ...hostLogContext(host),
    path: query.path,
  });

  const project = projectStore
    .list(host.id)
    .filter((project) => isWithinDirectory(project.remotePath, query.rootPath))
    .sort(
      (left, right) =>
        posix.normalize(right.remotePath).length - posix.normalize(left.remotePath).length,
    )[0];
  if (!project || !isWithinDirectory(query.rootPath, query.path)) throw outsideWorkspace();

  const abort = new AbortController();
  event.node.res.once("close", () => abort.abort());
  const sftp = await sshConnections.sftp(host);
  const archive = await openWorkspaceZip(
    sftp,
    project.remotePath,
    query.rootPath,
    query.path,
    abort.signal,
  );
  setResponseHeaders(event, {
    "cache-control": "private, no-store",
    "content-disposition": "attachment",
    "content-type": "application/zip",
    "x-content-type-options": "nosniff",
  });
  await pipeline(archive, event.node.res, { signal: abort.signal }).catch((error: unknown) => {
    if (!(error instanceof Error && error.name === "AbortError" && abort.signal.aborted)) {
      throw error;
    }
  });
});
