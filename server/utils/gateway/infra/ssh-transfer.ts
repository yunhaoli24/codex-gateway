import { createReadStream } from "node:fs";
import { stat as statLocal } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import pRetry from "p-retry";
import type { SFTPWrapper } from "ssh2";
import type { HostWithSecret } from "./ssh-types";
import { isConnectionLevelSshError } from "./ssh-errors";

interface SftpTransferConnection {
  sftp(host: HostWithSecret): Promise<SFTPWrapper>;
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

  await pRetry(
    async () => {
      try {
        const sftp = await connection.sftp(host);
        let offset = await remoteFileSize(sftp, partialPath);
        if (offset > localSize) {
          await unlinkRemoteFile(sftp, partialPath);
          offset = 0;
        }
        if (offset < localSize) {
          const reader = createReadStream(localPath, { start: offset });
          const writer = sftp.createWriteStream(partialPath, {
            flags: offset > 0 ? "r+" : "w",
            mode: 0o600,
            start: offset,
          });
          await pipeline(reader, writer);
        }
        const uploadedSize = await remoteFileSize(sftp, partialPath);
        if (uploadedSize !== localSize) {
          throw new Error(
            `Incomplete SFTP upload for ${remotePath}: ${uploadedSize}/${localSize} bytes`,
          );
        }
        await renameRemoteFile(sftp, partialPath, remotePath);
      } catch (error) {
        if (isTransientSftpTransferError(error)) connection.disconnectHost(host);
        throw error;
      }
    },
    {
      retries: 4,
      minTimeout: 1_000,
      factor: 2,
      shouldRetry: ({ error }) => isTransientSftpTransferError(error),
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        console.info("[gateway-ssh] retrying resumable SFTP upload", {
          hostId: host.id,
          hostName: host.name,
          attempt: attemptNumber,
          retriesLeft,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    },
  );
  return remotePath;
}

async function remoteFileSize(sftp: SFTPWrapper, path: string) {
  return await new Promise<number>((resolve, reject) => {
    sftp.stat(path, (error, stats) => {
      if (!error) {
        resolve(stats.size);
        return;
      }
      if (isMissingSftpFile(error)) {
        resolve(0);
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

function isTransientSftpTransferError(error: unknown) {
  if (isConnectionLevelSshError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /SSH channel closed|socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|Incomplete SFTP upload/i.test(
    message,
  );
}
