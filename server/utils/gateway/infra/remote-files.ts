import type { FileEntryWithStats } from "ssh2";
import { posix } from "node:path";
import { remoteLoginShellCommand } from "./remote-command";
import { shellQuote } from "./shell";
import type { SshConnectionPool } from "./ssh-connection";
import type { HostWithSecret, RemoteFileMetadata, RemoteFileResult } from "./ssh-types";

export class RemoteDirectoryNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "remoteDirectoryNotFound";

  constructor(
    readonly inputPath: string,
    readonly resolvedPath: string,
  ) {
    super(
      `Remote directory does not exist or is not a directory: ${inputPath} (resolved to ${resolvedPath})`,
    );
    this.name = "RemoteDirectoryNotFoundError";
  }
}

export class RemoteFileService {
  constructor(private readonly ssh: SshConnectionPool) {}

  async listDirectories(host: HostWithSecret, path: string) {
    const resolvedPath = await this.resolveRemoteDirectory(host, path);
    const sftp = await this.ssh.sftp(host);
    return new Promise<ReturnType<typeof directoryResult>>((resolve, reject) => {
      sftp.readdir(resolvedPath, (readError, entries) => {
        if (readError) {
          reject(readError);
          return;
        }
        resolve(directoryResult(resolvedPath, entries));
      });
    });
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

  async statRemoteFile(
    host: HostWithSecret,
    remotePath: string,
    options: { maxSize: number },
  ): Promise<RemoteFileMetadata> {
    const path = remotePath.trim();
    if (!path.startsWith("/")) {
      throw new Error("Remote file path must be absolute");
    }
    const sftp = await this.ssh.sftp(host);
    return new Promise<RemoteFileMetadata>((resolve, reject) => {
      sftp.stat(path, (statError, stats) => {
        if (statError) {
          reject(statError);
          return;
        }
        if (!stats.isFile()) {
          reject(new Error("Remote path is not a file"));
          return;
        }
        if (stats.size > options.maxSize) {
          reject(new Error(`Remote file exceeds ${options.maxSize} bytes`));
          return;
        }
        resolve({ path, size: stats.size, modifiedAt: stats.mtime * 1000 });
      });
    });
  }

  async openRemoteFile(
    host: HostWithSecret,
    metadata: RemoteFileMetadata,
  ): Promise<RemoteFileResult> {
    const sftp = await this.ssh.sftp(host);
    return new Promise<RemoteFileResult>((resolve, reject) => {
      const sample = Buffer.alloc(Math.min(metadata.size, 515));
      const openStream = (bytesRead: number) => {
        const stream = sftp.createReadStream(metadata.path);
        resolve({
          path: metadata.path,
          size: metadata.size,
          sample: sample.subarray(0, bytesRead),
          stream,
        });
      };
      if (!sample.length) {
        openStream(0);
        return;
      }
      sftp.open(metadata.path, "r", (openError, handle) => {
        if (openError) {
          reject(openError);
          return;
        }
        sftp.read(handle, sample, 0, sample.length, 0, (readError, bytesRead) => {
          sftp.close(handle, (closeError) => {
            if (readError || closeError) {
              reject(readError || closeError);
              return;
            }
            openStream(bytesRead);
          });
        });
      });
    });
  }

  async createUploadDirectory(host: HostWithSecret) {
    const script =
      'root="${TMPDIR:-/tmp}/codex-gateway-uploads"; mkdir -p "$root"; mktemp -d "$root/upload.XXXXXXXXXX"';
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

function directoryResult(path: string, source: FileEntryWithStats[]) {
  const entries = source.map(({ filename, attrs }) => ({
    name: filename,
    path: `${path.replace(/\/$/, "")}/${filename}`,
    type: attrs.isDirectory()
      ? ("directory" as const)
      : attrs.isFile()
        ? ("file" as const)
        : ("other" as const),
    size: attrs.isFile() ? attrs.size : null,
    modifiedAt: attrs.mtime ? attrs.mtime * 1000 : null,
  }));
  entries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  return { path, entries };
}
