import { remoteLoginShellCommand } from "./remote-command";
import { shellQuote } from "./shell";
import type { SshConnectionPool } from "./ssh-connection";
import type { RemoteFileResult, HostWithSecret } from "./ssh-types";

export class RemoteFileService {
  constructor(private readonly ssh: SshConnectionPool) {}

  async listDirectories(host: HostWithSecret, path: string) {
    const normalizedPath = path?.trim() || ".";
    const script = `
set -eu
input=$1
case "$input" in
  "~") base=$HOME ;;
  "~/"*) base=$HOME/\${input#~/} ;;
  *) base=$input ;;
esac
if ! [ -d "$base" ]; then
  echo "Remote path is not a directory: $input" >&2
  exit 1
fi
base=$(cd "$base" && pwd -P)
printf 'BASE\\t%s\\n' "$base"
for entry in "$base"/*; do
  [ -e "$entry" ] || continue
  name=\${entry##*/}
  case "$name" in .*) continue ;; esac
  if [ -d "$entry" ]; then
    type=directory
  elif [ -f "$entry" ]; then
    type=file
  else
    type=other
  fi
  printf 'ENTRY\\t%s\\t%s\\t%s\\n' "$type" "$name" "$entry"
done
`;
    const command = remoteLoginShellCommand(
      `sh -c ${shellQuote(script)} sh ${shellQuote(normalizedPath)}`,
    );
    const result = await this.ssh.exec(host, command);
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed to list remote directory: ${normalizedPath}`);
    }
    return parseDirectoryListing(result.stdout);
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

  async readRemoteFile(
    host: HostWithSecret,
    remotePath: string,
    options: { maxSize: number },
  ): Promise<RemoteFileResult> {
    const path = remotePath.trim();
    if (!path.startsWith("/")) {
      throw new Error("Remote file path must be absolute");
    }

    const client = await this.ssh.connect(host);
    return new Promise<RemoteFileResult>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error);
          return;
        }

        const cleanup = () => {
          sftp.end();
        };

        sftp.stat(path, (statError, stats) => {
          if (statError) {
            cleanup();
            reject(statError);
            return;
          }
          if (!stats.isFile()) {
            cleanup();
            reject(new Error("Remote path is not a file"));
            return;
          }
          if (stats.size > options.maxSize) {
            cleanup();
            reject(new Error(`Remote file exceeds ${options.maxSize} bytes`));
            return;
          }

          sftp.readFile(path, (readError, data) => {
            cleanup();
            if (readError) {
              reject(readError);
              return;
            }
            resolve({ path, size: stats.size, data });
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
}

function parseDirectoryListing(output: string) {
  let path = "";
  const entries: Array<{ name: string; path: string; type: "directory" | "file" | "other" }> = [];

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }
    const [recordType, ...fields] = line.split("\t");
    if (recordType === "BASE") {
      path = fields.join("\t");
      continue;
    }
    if (recordType !== "ENTRY" || fields.length < 3) {
      continue;
    }
    const [type, name, ...pathParts] = fields;
    if (type !== "directory" && type !== "file" && type !== "other") {
      continue;
    }
    entries.push({
      type,
      name,
      path: pathParts.join("\t"),
    });
  }

  entries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return { path, entries };
}
