import { createReadStream } from "node:fs";
import { stat as statLocal } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { SFTPWrapper } from "ssh2";
import type { HostWithSecret } from "./ssh-types";
import { isConnectionLevelSshError } from "./ssh-errors";
import { withSftpUploadProgress } from "./ssh-upload-progress";

// @types/ssh2 omits the public counter maintained by SFTP WriteStream._write/_writev.
// Declare the actual library field so progress tracking needs neither a cast nor a second counter.
declare module "ssh2" {
  interface WriteStream {
    bytesWritten: number;
  }
}

interface SftpTransferConnection {
  sftp(host: HostWithSecret): Promise<SFTPWrapper>;
  closeSftp(host: HostWithSecret): void;
  disconnectHost(host: HostWithSecret): void;
}

export async function uploadFile(
  connection: SftpTransferConnection,
  host: HostWithSecret,
  localPath: string,
  remotePath: string,
) {
  const sftp = await connection.sftp(host);
  await new Promise<void>((resolve, reject) => {
    const reader = createReadStream(localPath);
    const writer = sftp.createWriteStream(remotePath, { mode: 0o600 });
    reader.on("error", reject);
    writer.on("error", reject);
    writer.on("close", resolve);
    reader.pipe(writer);
  });
  return remotePath;
}

export async function uploadFileResumable(
  connection: SftpTransferConnection,
  host: HostWithSecret,
  localPath: string,
  remotePath: string,
) {
  const localSize = (await statLocal(localPath)).size;
  const partialPath = `${remotePath}.part`;

  // Queue admission owns retries. A transfer failure must release its upgrade slot immediately.
  try {
    await withSftpUploadProgress(
      host,
      localSize,
      () => connection.closeSftp(host),
      async (monitor) => {
        const sftp = await connection.sftp(host);
        monitor.phase("stat");
        const completeSize = await remoteFileSize(sftp, remotePath);
        monitor.phase("stat partial");
        if (completeSize === localSize) return;
        let offset = (await remoteFileSize(sftp, partialPath)) ?? 0;
        monitor.phase("prepare upload");
        if (offset > localSize) {
          await unlinkRemoteFile(sftp, partialPath);
          monitor.phase("restart upload");
          offset = 0;
        }
        if (offset < localSize) {
          const reader = createReadStream(localPath, { start: offset });
          const writer = sftp.createWriteStream(partialPath, {
            flags: offset > 0 ? "r+" : "w",
            mode: 0o600,
            start: offset,
          });
          // ssh2 counts bytesWritten after remote WRITE acknowledgement. Local reader/Transform
          // data events only measure buffering and must not reset an upload's idle deadline.
          monitor.track(() => offset + writer.bytesWritten);
          await pipeline(reader, writer, { signal: monitor.signal });
        }
        monitor.phase("verify upload");
        const uploadedSize = await remoteFileSize(sftp, partialPath);
        monitor.phase("rename upload");
        if (uploadedSize !== localSize) {
          throw new Error(
            `Incomplete SFTP upload for ${remotePath}: ${uploadedSize ?? 0}/${localSize} bytes`,
          );
        }
        await renameRemoteFile(sftp, partialPath, remotePath);
        monitor.phase("completed");
      },
    );
  } catch (error) {
    // A stalled SFTP request does not prove the shared Agent/Terminal transport is dead.
    if (isConnectionLevelSshError(error)) connection.disconnectHost(host);
    throw error;
  }
  return remotePath;
}

async function remoteFileSize(sftp: SFTPWrapper, path: string) {
  return await new Promise<number | null>((resolve, reject) => {
    sftp.stat(path, (error, stats) => {
      if (!error) {
        resolve(stats.size);
        return;
      }
      if (isMissingSftpFile(error)) {
        resolve(null);
        return;
      }
      reject(error);
    });
  });
}

async function unlinkRemoteFile(sftp: SFTPWrapper, path: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.unlink(path, (error) => (error && !isMissingSftpFile(error) ? reject(error) : resolve()));
  });
}

async function renameRemoteFile(sftp: SFTPWrapper, from: string, to: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.rename(from, to, (error) => (error ? reject(error) : resolve()));
  });
}

function isMissingSftpFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 2;
}

export function isTransientSftpTransferError(error: unknown) {
  if (isConnectionLevelSshError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /SSH channel closed|socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|SFTP upload timed out|Incomplete SFTP upload/i.test(
    message,
  );
}
