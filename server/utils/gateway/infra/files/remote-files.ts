import pLimit from "p-limit";
import type { FileEntryWithStats, SFTPWrapper, Stats } from "ssh2";
import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { remoteLoginShellCommand } from "../ssh/remote-command";
import { shellQuote } from "../ssh/shell";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret, RemoteFileMetadata, RemoteFileResult } from "../ssh/ssh-types";
import {
  classifyRemoteDirectoryError,
  classifyRemoteFileError,
  RemoteDirectoryNotFoundError,
  RemoteFileInvalidPathError,
  RemoteFileNotRegularError,
  RemoteFileTooLargeError,
} from "./remote-file-errors";

export class RemoteFileService {
  constructor(private readonly ssh: SshConnectionPool) {}

  async listDirectories(host: HostWithSecret, path: string) {
    const resolvedPath = await this.resolveRemoteDirectory(host, path);
    const sftp = await this.ssh.sftp(host);
    const entries = await new Promise<FileEntryWithStats[]>((resolve, reject) => {
      sftp.readdir(resolvedPath, (readError, entries) => {
        if (readError) {
          reject(classifyRemoteDirectoryError(readError, path, resolvedPath));
          return;
        }
        resolve(entries);
      });
    });
    return directoryResult(sftp, resolvedPath, entries);
  }

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    const directory = remotePath.split("/").slice(0, -1).join("/") || ".";
    const mkdir = await this.ssh.exec(
      host,
      remoteLoginShellCommand(`mkdir -p ${shellQuote(directory)}`),
    );
    if (mkdir.code !== 0) {
      throw new Error(mkdir.stderr || `Failed to create remote upload directory: ${directory}`);
    }
    return this.ssh.uploadFile(host, localPath, remotePath);
  }

  async deleteFile(host: HostWithSecret, path: string) {
    if (!path.startsWith("/")) {
      throw new RemoteFileInvalidPathError(path);
    }
    const sftp = await this.ssh.sftp(host);
    await new Promise<void>((resolve, reject) => {
      sftp.unlink(path, (error) =>
        error ? reject(classifyRemoteFileError(error, path)) : resolve(),
      );
    });
  }

  async writeTextFile(host: HostWithSecret, path: string, content: Buffer) {
    if (!path.startsWith("/")) {
      throw new RemoteFileInvalidPathError(path);
    }
    const sftp = await this.ssh.sftp(host);
    const stats = await statFile(sftp, path);
    const temporaryPath = `${path}.codex-gateway-${randomUUID()}.tmp`;
    try {
      await writeBuffer(sftp, temporaryPath, content, stats.mode & 0o7777);
      await renameFile(sftp, temporaryPath, path);
    } catch (error) {
      await unlinkIfPresent(sftp, temporaryPath);
      throw classifyRemoteFileError(error, path);
    }
    return statFile(sftp, path);
  }

  async statRemoteFile(
    host: HostWithSecret,
    remotePath: string,
    options: { maxSize: number },
  ): Promise<RemoteFileMetadata> {
    const path = remotePath.trim();
    if (!path.startsWith("/")) {
      throw new RemoteFileInvalidPathError(path);
    }
    const sftp = await this.ssh.sftp(host);
    return new Promise<RemoteFileMetadata>((resolve, reject) => {
      sftp.stat(path, (statError, stats) => {
        if (statError) {
          reject(classifyRemoteFileError(statError, path));
          return;
        }
        if (!stats.isFile()) {
          reject(new RemoteFileNotRegularError(path));
          return;
        }
        if (stats.size > options.maxSize) {
          reject(new RemoteFileTooLargeError(path, options.maxSize));
          return;
        }
        resolve({ path, size: stats.size, modifiedAt: stats.mtime * 1000 });
      });
    });
  }

  async openRemoteFile(
    host: HostWithSecret,
    remotePath: string,
    options: { maxSize: number },
  ): Promise<RemoteFileResult> {
    const path = remotePath.trim();
    if (!path.startsWith("/")) throw new RemoteFileInvalidPathError(path);
    const sftp = await this.ssh.sftp(host);
    return new Promise<RemoteFileResult>((resolve, reject) => {
      sftp.open(path, "r", (openError, handle) => {
        if (openError) {
          reject(classifyRemoteFileError(openError, path));
          return;
        }
        sftp.fstat(handle, (statError, stats) => {
          if (statError || !stats.isFile() || stats.size > options.maxSize) {
            sftp.close(handle, () => {
              if (statError) reject(classifyRemoteFileError(statError, path));
              else if (!stats.isFile()) reject(new RemoteFileNotRegularError(path));
              else reject(new RemoteFileTooLargeError(path, options.maxSize));
            });
            return;
          }
          const sample = Buffer.alloc(Math.min(stats.size, 515));
          const openStream = (bytesRead: number) => {
            // Keep the validated handle for the response stream. Reopening by pathname would
            // reintroduce a stat/open race where a replaced or growing file bypasses maxSize.
            const stream = sftp.createReadStream(path, { handle, autoClose: true, start: 0 });
            resolve({
              path,
              size: stats.size,
              modifiedAt: stats.mtime * 1000,
              sample: sample.subarray(0, bytesRead),
              stream,
            });
          };
          if (sample.length === 0) {
            openStream(0);
            return;
          }
          sftp.read(handle, sample, 0, sample.length, 0, (readError, bytesRead) => {
            if (readError) {
              sftp.close(handle, () => reject(classifyRemoteFileError(readError, path)));
              return;
            }
            openStream(bytesRead);
          });
        });
      });
    });
  }

  async createUploadDirectory(host: HostWithSecret) {
    // Match the official TUI's attachment layout on the app-server host. Each file gets its
    // own directory so original names survive, including two uploads with the same filename.
    // Resolve CODEX_HOME in the login shell used by Codex; /tmp is not durable attachment storage.
    const script = `
set -eu
umask 077
root="\${CODEX_HOME:-$HOME/.codex}/attachments/${randomUUID()}"
mkdir -p "$root"
cd "$root"
pwd -P
`;
    const result = await this.ssh.exec(host, remoteLoginShellCommand(script));
    if (result.code !== 0) {
      throw new Error(result.stderr || "Failed to create remote upload directory");
    }
    return result.stdout.trim();
  }

  private async resolveRemoteDirectory(host: HostWithSecret, path: string) {
    const normalizedPath = path?.trim() || ".";
    if (normalizedPath.startsWith("/")) {
      return posix.normalize(normalizedPath);
    }
    const script = `
set -eu
input=$1
case "$input" in
  "~") base=$HOME ;;
  "~/"*) base=$HOME/\${input#~/} ;;
  /*) base=$input ;;
  *) base=$HOME/$input ;;
esac
if ! [ -d "$base" ]; then
  printf '%s' "$base"
  exit 44
fi
cd "$base"
pwd -P
`;
    const command = remoteLoginShellCommand(
      `sh -c ${shellQuote(script)} sh ${shellQuote(normalizedPath)}`,
    );
    const result = await this.ssh.exec(host, command);
    if (result.code === 44) {
      throw new RemoteDirectoryNotFoundError(normalizedPath, result.stdout.trim());
    }
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed to resolve remote directory: ${normalizedPath}`);
    }
    return result.stdout.trim();
  }
}

function statFile(sftp: Awaited<ReturnType<SshConnectionPool["sftp"]>>, path: string) {
  return new Promise<{ size: number; modifiedAt: number; mode: number }>((resolve, reject) => {
    sftp.stat(path, (error, stats) => {
      if (error) return reject(classifyRemoteFileError(error, path));
      if (!stats.isFile()) return reject(new RemoteFileNotRegularError(path));
      resolve({ size: stats.size, modifiedAt: stats.mtime * 1000, mode: stats.mode });
    });
  });
}

function writeBuffer(
  sftp: Awaited<ReturnType<SshConnectionPool["sftp"]>>,
  path: string,
  content: Buffer,
  mode: number,
) {
  return new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(path, { flags: "wx", mode });
    stream.once("error", reject);
    stream.once("close", resolve);
    stream.end(content);
  });
}

function renameFile(
  sftp: Awaited<ReturnType<SshConnectionPool["sftp"]>>,
  source: string,
  destination: string,
) {
  return new Promise<void>((resolve, reject) => {
    sftp.ext_openssh_rename(source, destination, (error) => (error ? reject(error) : resolve()));
  });
}

function unlinkIfPresent(sftp: Awaited<ReturnType<SshConnectionPool["sftp"]>>, path: string) {
  return new Promise<void>((resolve) => sftp.unlink(path, () => resolve()));
}

async function directoryResult(sftp: SFTPWrapper, path: string, source: FileEntryWithStats[]) {
  const limitSymlinkStat = pLimit(8);
  const entries = await Promise.all(
    source.map(async ({ filename, attrs }) => {
      const entryPath = posix.join(path, filename);
      // SFTP readdir returns lstat-like attributes, so a link is neither a file nor a directory.
      // Follow only links to recover the target type; regular entries need no extra round trip.
      // Broken or inaccessible links intentionally remain `other` instead of making the entire
      // directory unreadable. Limit concurrency because every stat shares the Host's SFTP channel.
      const effectiveAttrs = attrs.isSymbolicLink()
        ? await limitSymlinkStat(() => statLinkedEntry(sftp, entryPath))
        : attrs;
      return {
        name: filename,
        path: entryPath,
        type: directoryEntryType(effectiveAttrs),
        size: effectiveAttrs?.isFile() === true ? effectiveAttrs.size : null,
        modifiedAt:
          effectiveAttrs === null || effectiveAttrs === undefined
            ? null
            : effectiveAttrs.mtime * 1000,
      };
    }),
  );
  entries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  return { path, entries };
}

function statLinkedEntry(sftp: SFTPWrapper, path: string) {
  return new Promise<Stats | null>((resolve) => {
    sftp.stat(path, (error, stats) => resolve(error ? null : stats));
  });
}

function directoryEntryType(attrs: Stats | null) {
  if (attrs?.isDirectory() === true) return "directory" as const;
  if (attrs?.isFile() === true) return "file" as const;
  return "other" as const;
}
