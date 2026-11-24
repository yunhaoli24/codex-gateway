import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { createError } from "h3";
import type { SFTPWrapper } from "ssh2";
import { isMissingSftpPath } from "./remote-file-errors";
import { isWithinDirectory, realPathFor } from "./workspace-paths";

export async function resolveUploadDirectory(sftp: SFTPWrapper, root: string, path: string) {
  if (!isWithinDirectory(root, path)) throw outsideProject();
  const [realRoot, realPath] = await Promise.all([
    realPathFor(sftp, root),
    realPathFor(sftp, path),
  ]);
  if (!isWithinDirectory(realRoot, realPath)) throw outsideProject();
  return realPath;
}

export async function uploadWorkspaceFile(
  sftp: SFTPWrapper,
  localPath: string,
  directory: string,
  name: string,
) {
  const destination = posix.join(directory, name);
  if (await pathExists(sftp, destination)) throw alreadyExists();
  const temporary = posix.join(directory, `.codex-gateway-upload-${randomUUID()}.tmp`);
  try {
    await pipeline(
      createReadStream(localPath),
      sftp.createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    // Standard SFTP rename refuses an existing destination. The OpenSSH POSIX extension used
    // by the text editor deliberately replaces files and must not be used for new uploads.
    await new Promise<void>((resolve, reject) =>
      sftp.rename(temporary, destination, (error) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    await new Promise<void>((resolve) => sftp.unlink(temporary, () => resolve()));
    if (await pathExists(sftp, destination)) throw alreadyExists();
    throw error;
  }
  return destination;
}

async function pathExists(sftp: SFTPWrapper, path: string) {
  return new Promise<boolean>((resolve, reject) =>
    sftp.lstat(path, (error) => {
      if (!error) resolve(true);
      else if (isMissingSftpPath(error)) resolve(false);
      else reject(error);
    }),
  );
}

function outsideProject() {
  return createError({
    statusCode: 403,
    statusMessage: "Upload destination is outside the project",
  });
}

function alreadyExists() {
  return createError({
    statusCode: 409,
    statusMessage: "A file with this name already exists",
    data: { code: "remoteFileAlreadyExists" },
  });
}
