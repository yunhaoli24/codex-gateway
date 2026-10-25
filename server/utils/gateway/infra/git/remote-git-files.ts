import { posix } from "node:path";
import { LRUCache } from "lru-cache";
import type {
  RemoteGitFileBaseline,
  RemoteGitFileComparison,
  RemoteGitFileStatus,
  RemoteGitWorkspaceSnapshot,
} from "~~/shared/types";
import { MAX_GIT_DIFF_BYTES } from "~~/shared/file-preview";
import { remoteLoginShellCommand } from "../ssh/remote-command";
import { shellQuote } from "../ssh/shell";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret } from "../ssh/ssh-types";
import { gatewayLog } from "../../logging";
import { KeyedTaskLimiter } from "../concurrency/keyed-task-limiter";
import { parseGitStatusRecords } from "./git-status-parser";

const GIT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_GIT_METADATA_OUTPUT_BYTES = 256 * 1024;
const MAX_GIT_WORKSPACE_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_GIT_WORKSPACE_FILES = 20_000;
const MAX_GIT_ERROR_LOG_BYTES = 8 * 1024;

interface GitMetadata {
  repositoryRoot: string;
  relativePath: string;
  originalPath: string | null;
  headOid: string | null;
  fileSize: number;
  status: RemoteGitFileStatus;
  staged: boolean;
  unstaged: boolean;
}

export class RemoteGitFileService {
  private readonly pending = new Map<string, Promise<RemoteGitFileComparison>>();
  private readonly pendingWorkspace = new Map<string, Promise<RemoteGitWorkspaceSnapshot>>();
  private readonly transportLimiter = new KeyedTaskLimiter(2);
  // HEAD blobs are immutable at this key. Worktree notifications still re-read status, but must
  // not repeatedly transfer the same committed file over a slow SSH route. Scope by transport
  // and repository as well as revision/path; unrelated Hosts must never share private contents.
  private readonly baselines = new LRUCache<string, RemoteGitFileBaseline>({
    max: 256,
    maxSize: 16 * 1024 * 1024,
    sizeCalculation: (baseline) =>
      baseline.kind === "head" ? Math.max(1, Buffer.byteLength(baseline.text)) : 64,
    ttl: 10 * 60_000,
    ttlAutopurge: true,
  });

  constructor(private readonly ssh: SshConnectionPool) {}

  async compare(
    host: HostWithSecret,
    cwd: string,
    requestedPath: string,
  ): Promise<RemoteGitFileComparison> {
    const path = posix.normalize(requestedPath.trim());
    const projectPath = posix.normalize(cwd.trim());
    if (!path.startsWith("/") || !projectPath.startsWith("/")) {
      return { availability: "outsideWorktree" };
    }
    const transportKey = this.ssh.connectionKeyFor(host);
    const requestKey = `${transportKey}\0${projectPath}\0${path}`;
    const existing = this.pending.get(requestKey);
    if (existing !== undefined) return await existing;

    const deadline = Date.now() + GIT_COMMAND_TIMEOUT_MS;
    const signal = AbortSignal.timeout(GIT_COMMAND_TIMEOUT_MS);
    let tracked: Promise<RemoteGitFileComparison>;
    tracked = this.transportLimiter
      .run(transportKey, () => this.compareOnce(host, projectPath, path, deadline, signal), {
        signal,
      })
      .catch((error: unknown) => {
        if (signal.aborted) {
          throw new Error(`Remote Git comparison timed out after ${GIT_COMMAND_TIMEOUT_MS}ms`, {
            cause: error,
          });
        }
        throw error;
      })
      .finally(() => {
        if (this.pending.get(requestKey) === tracked) this.pending.delete(requestKey);
      });
    this.pending.set(requestKey, tracked);
    return await tracked;
  }

  async inspectWorkspace(
    host: HostWithSecret,
    cwd: string,
    requestedRootPath: string,
  ): Promise<RemoteGitWorkspaceSnapshot> {
    const rootPath = posix.normalize(requestedRootPath.trim());
    const projectPath = posix.normalize(cwd.trim());
    if (!rootPath.startsWith("/") || !projectPath.startsWith("/")) {
      return { availability: "outsideWorktree" };
    }
    const transportKey = this.ssh.connectionKeyFor(host);
    const requestKey = `${transportKey}\0${projectPath}\0${rootPath}`;
    const existing = this.pendingWorkspace.get(requestKey);
    if (existing !== undefined) return await existing;

    const signal = AbortSignal.timeout(GIT_COMMAND_TIMEOUT_MS);
    const deadline = Date.now() + GIT_COMMAND_TIMEOUT_MS;
    let tracked: Promise<RemoteGitWorkspaceSnapshot>;
    tracked = this.transportLimiter
      .run(
        transportKey,
        () => this.inspectWorkspaceOnce(host, projectPath, rootPath, deadline, signal),
        { signal },
      )
      .catch((error: unknown) => {
        if (signal.aborted) {
          throw new Error(
            `Remote Git workspace inspection timed out after ${GIT_COMMAND_TIMEOUT_MS}ms`,
            {
              cause: error,
            },
          );
        }
        throw error;
      })
      .finally(() => {
        if (this.pendingWorkspace.get(requestKey) === tracked) {
          this.pendingWorkspace.delete(requestKey);
        }
      });
    this.pendingWorkspace.set(requestKey, tracked);
    return await tracked;
  }

  private async compareOnce(
    host: HostWithSecret,
    projectPath: string,
    path: string,
    deadline: number,
    signal: AbortSignal,
  ) {
    const result = await this.ssh.exec(host, metadataCommand(projectPath, path), {
      timeoutMs: remainingTimeout(deadline),
      signal,
      maxOutputBytes: MAX_GIT_METADATA_OUTPUT_BYTES,
    });
    if (result.code !== 0) {
      reportGitCommandFailure(host, "file comparison", result.code, result.stderr);
      throw new Error("Failed to inspect remote Git file state");
    }
    const parsed = parseMetadata(result.stdout);
    if (parsed.availability !== "available") return parsed;
    const baseline = await this.readBaseline(host, parsed.metadata, deadline, signal);
    return comparisonFromMetadata(parsed.metadata, baseline);
  }

  private async inspectWorkspaceOnce(
    host: HostWithSecret,
    projectPath: string,
    rootPath: string,
    deadline: number,
    signal: AbortSignal,
  ): Promise<RemoteGitWorkspaceSnapshot> {
    const result = await this.ssh.exec(host, workspaceCommand(projectPath, rootPath), {
      timeoutMs: remainingTimeout(deadline),
      signal,
      // Porcelain output is machine-readable but unbounded. A generated directory with hundreds of
      // thousands of untracked files must fail as one inspection instead of exhausting Gateway
      // memory or producing a WebSocket frame that the browser cannot safely materialize.
      maxOutputBytes: MAX_GIT_WORKSPACE_OUTPUT_BYTES,
    });
    if (result.code !== 0) {
      reportGitCommandFailure(host, "workspace inspection", result.code, result.stderr);
      throw new Error("Failed to inspect remote Git workspace");
    }
    return parseWorkspaceSnapshot(result.stdout);
  }

  private async readBaseline(
    host: HostWithSecret,
    metadata: GitMetadata,
    deadline: number,
    signal: AbortSignal,
  ): Promise<RemoteGitFileBaseline> {
    if (metadata.status === "ignored") {
      return { kind: "unavailable", reason: "ignored" };
    }
    if (metadata.fileSize > MAX_GIT_DIFF_BYTES) {
      return { kind: "unavailable", reason: "tooLarge" };
    }
    if (metadata.headOid === null || metadata.status === "untracked") {
      return { kind: "empty", revision: metadata.headOid };
    }
    const objectPath = metadata.originalPath ?? metadata.relativePath;
    const object = `${metadata.headOid}:${objectPath}`;
    const cacheKey = JSON.stringify([
      this.ssh.connectionKeyFor(host),
      metadata.repositoryRoot,
      object,
    ]);
    const cached = this.baselines.get(cacheKey);
    if (cached !== undefined) return cached;
    const result = await this.ssh.exec(host, baselineCommand(metadata.repositoryRoot, object), {
      timeoutMs: remainingTimeout(deadline),
      signal,
      maxOutputBytes: MAX_GIT_DIFF_BYTES,
    });
    if (result.code === 45) {
      const baseline = { kind: "empty", revision: metadata.headOid } as const;
      this.baselines.set(cacheKey, baseline);
      return baseline;
    }
    if (result.code === 46) {
      const baseline = { kind: "unavailable", reason: "tooLarge" } as const;
      this.baselines.set(cacheKey, baseline);
      return baseline;
    }
    if (result.code !== 0) {
      reportGitCommandFailure(host, "baseline read", result.code, result.stderr);
      throw new Error("Failed to read remote Git baseline");
    }
    const baseline = { kind: "head", revision: metadata.headOid, text: result.stdout } as const;
    this.baselines.set(cacheKey, baseline);
    return baseline;
  }
}

function reportGitCommandFailure(
  host: HostWithSecret,
  operation: string,
  exitCode: number | null,
  stderr: string,
) {
  const detail = stderr.trim();
  gatewayLog("error", "gateway", "remote Git command failed", {
    hostId: host.id,
    hostName: host.name,
    operation,
    exitCode,
    // Git can emit one line per unreadable generated file. Keep enough tail context to diagnose
    // the remote filesystem without copying megabytes into Docker logs or a realtime response.
    stderrTail:
      detail.length <= MAX_GIT_ERROR_LOG_BYTES
        ? detail
        : detail.slice(detail.length - MAX_GIT_ERROR_LOG_BYTES),
    stderrTruncated: detail.length > MAX_GIT_ERROR_LOG_BYTES,
  });
}

function remainingTimeout(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Remote Git comparison timed out after ${GIT_COMMAND_TIMEOUT_MS}ms`);
  }
  return remaining;
}

function comparisonFromMetadata(
  metadata: GitMetadata,
  baseline: RemoteGitFileBaseline,
): RemoteGitFileComparison {
  // GitMetadata also carries fileSize for the server-side baseline cap. Project the public DTO
  // field-by-field at the realtime boundary: spreading infrastructure state here previously leaked
  // fileSize into the strict WebSocket schema, so the browser rejected the otherwise valid frame.
  return {
    availability: "available",
    repositoryRoot: metadata.repositoryRoot,
    relativePath: metadata.relativePath,
    originalPath: metadata.originalPath,
    headOid: metadata.headOid,
    status: metadata.status,
    staged: metadata.staged,
    unstaged: metadata.unstaged,
    baseline,
  };
}

function metadataCommand(projectPath: string, path: string) {
  const script = `
set -eu
project_path=$1
requested_file_path=$2
if ! command -v git >/dev/null 2>&1; then
  printf 'gitUnavailable\\0'
  exit 0
fi
if [ "$project_path" != / ]; then
  case "$requested_file_path" in
    "$project_path"|"$project_path"/*) ;;
    *) printf 'outsideWorktree\\0'; exit 0 ;;
  esac
fi
if ! cd -- "$project_path" 2>/dev/null; then
  printf 'outsideWorktree\\0'
  exit 0
fi
physical_project=$(pwd -P)
if [ "$project_path" = / ]; then
  candidate_file_path=$requested_file_path
else
  suffix=\${requested_file_path#"$project_path"}
  candidate_file_path="$physical_project$suffix"
fi

# The file transport follows directory and file symlinks. Resolve an existing file to that same
# physical target. For a deleted worktree file, resolve its existing parent and retain the basename
# so Git can still report D and provide the HEAD blob.
if [ -e "$candidate_file_path" ] || [ -L "$candidate_file_path" ]; then
  if command -v realpath >/dev/null 2>&1; then
    file_path=$(realpath "$candidate_file_path" 2>/dev/null || true)
  elif command -v readlink >/dev/null 2>&1; then
    file_path=$(readlink -f "$candidate_file_path" 2>/dev/null || true)
  else
    file_directory=$(dirname "$candidate_file_path")
    file_name=$(basename "$candidate_file_path")
    if cd -P -- "$file_directory" 2>/dev/null; then
      file_path="$(pwd -P)/$file_name"
      [ -L "$file_path" ] && file_path=
    else
      file_path=
    fi
  fi
else
  # A tracked path can disappear together with one or more parent directories. Walk to the nearest
  # existing ancestor and preserve the missing suffix; Git can then discover the repository and
  # report the deleted path without requiring any worktree directory to remain on disk.
  existing_ancestor=$candidate_file_path
  missing_suffix=
  while [ ! -e "$existing_ancestor" ] && [ ! -L "$existing_ancestor" ]; do
    missing_name=$(basename "$existing_ancestor")
    missing_suffix="/$missing_name$missing_suffix"
    parent=$(dirname "$existing_ancestor")
    [ "$parent" != "$existing_ancestor" ] || break
    existing_ancestor=$parent
  done
  if [ -d "$existing_ancestor" ] && cd -P -- "$existing_ancestor" 2>/dev/null; then
    git_lookup_directory=$(pwd -P)
    file_path="$git_lookup_directory$missing_suffix"
  else
    file_path=
  fi
fi
if [ -z "$file_path" ]; then
  printf 'outsideWorktree\\0'
  exit 0
fi
# Git-aware editors select the nearest repository for the file. Starting from the configured
# project would miss a nested repository or incorrectly select an outer repository.
if [ -z "\${git_lookup_directory:-}" ]; then
  git_lookup_directory=$(dirname "$file_path")
fi
repo_root=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$git_lookup_directory" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  printf 'notRepository\\0'
  exit 0
fi
repo_root=$(cd -- "$repo_root" && pwd -P)
if [ "$repo_root" = / ]; then
  relative_path=\${file_path#/}
else
  case "$file_path" in
    "$repo_root"/*) relative_path=\${file_path#"$repo_root"/} ;;
    *) printf 'outsideWorktree\\0'; exit 0 ;;
  esac
fi
[ -n "$relative_path" ] || { printf 'outsideWorktree\\0'; exit 0; }
head_oid=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" rev-parse --verify HEAD 2>/dev/null || true)
if [ -f "$file_path" ]; then
  file_size=$(wc -c < "$file_path" | tr -d '[:space:]')
else
  file_size=0
fi
printf 'available\\0%s\\0%s\\0%s\\0%s\\0' "$repo_root" "$relative_path" "$head_oid" "$file_size"
GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" status --porcelain=v2 -z --untracked-files=all --ignored=matching -- "$relative_path"
`;
  return remoteLoginShellCommand(
    `sh -c ${shellQuote(script)} sh ${shellQuote(projectPath)} ${shellQuote(path)}`,
  );
}

function baselineCommand(repositoryRoot: string, object: string) {
  const script = `
set -eu
repo_root=$1
object=$2
size=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" cat-file -s "$object" 2>/dev/null) || exit 45
case "$size" in ''|*[!0-9]*) exit 45 ;; esac
if [ "$size" -gt ${MAX_GIT_DIFF_BYTES} ]; then exit 46; fi
GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" cat-file blob "$object"
`;
  return remoteLoginShellCommand(
    `sh -c ${shellQuote(script)} sh ${shellQuote(repositoryRoot)} ${shellQuote(object)}`,
  );
}

function parseMetadata(
  output: string,
):
  | { availability: "gitUnavailable" | "notRepository" | "outsideWorktree" }
  | { availability: "available"; metadata: GitMetadata } {
  const fields = output.split("\0");
  const availability = fields[0];
  if (
    availability === "gitUnavailable" ||
    availability === "notRepository" ||
    availability === "outsideWorktree"
  ) {
    return { availability };
  }
  if (availability !== "available") {
    throw new Error("Remote Git inspection returned an invalid capability state");
  }
  const repositoryRoot = fields[1];
  const relativePath = fields[2];
  const rawHeadOid = fields[3];
  const rawFileSize = fields[4];
  const headOid = rawHeadOid === undefined || rawHeadOid === "" ? null : rawHeadOid;
  const fileSize = Number(rawFileSize);
  if (
    repositoryRoot === undefined ||
    repositoryRoot === "" ||
    relativePath === undefined ||
    relativePath === "" ||
    !Number.isSafeInteger(fileSize) ||
    fileSize < 0
  ) {
    throw new Error("Remote Git inspection returned incomplete repository metadata");
  }
  return {
    availability: "available",
    metadata: statusMetadata(repositoryRoot, relativePath, headOid, fileSize, fields.slice(5)),
  };
}

function statusMetadata(
  repositoryRoot: string,
  relativePath: string,
  headOid: string | null,
  fileSize: number,
  records: string[],
): GitMetadata {
  const record = records[0] ?? "";
  if (record === "") {
    return baseMetadata(
      repositoryRoot,
      relativePath,
      headOid,
      fileSize,
      "clean",
      false,
      false,
      null,
    );
  }
  if (record.startsWith("? ")) {
    return baseMetadata(
      repositoryRoot,
      relativePath,
      headOid,
      fileSize,
      "untracked",
      false,
      true,
      null,
    );
  }
  if (record.startsWith("! ")) {
    return baseMetadata(
      repositoryRoot,
      relativePath,
      headOid,
      fileSize,
      "ignored",
      false,
      false,
      null,
    );
  }
  const statusRecord = parseGitStatusRecords(records)[0];
  if (statusRecord === undefined) {
    throw new Error("Remote Git status did not describe the requested changed file");
  }
  return baseMetadata(
    repositoryRoot,
    relativePath,
    headOid,
    fileSize,
    statusRecord.status,
    statusRecord.staged,
    statusRecord.unstaged,
    statusRecord.originalPath,
  );
}

function baseMetadata(
  repositoryRoot: string,
  relativePath: string,
  headOid: string | null,
  fileSize: number,
  status: RemoteGitFileStatus,
  staged: boolean,
  unstaged: boolean,
  originalPath: string | null,
): GitMetadata {
  return {
    repositoryRoot,
    relativePath,
    originalPath,
    headOid,
    fileSize,
    status,
    staged,
    unstaged,
  };
}

function workspaceCommand(projectPath: string, rootPath: string) {
  const script = `
set -eu
project_path=$1
requested_root_path=$2
if ! command -v git >/dev/null 2>&1; then
  printf 'gitUnavailable\\0'
  exit 0
fi
if [ "$project_path" != / ]; then
  case "$requested_root_path" in
    "$project_path"|"$project_path"/*) ;;
    *) printf 'outsideWorktree\\0'; exit 0 ;;
  esac
fi
if ! cd -- "$requested_root_path" 2>/dev/null; then
  printf 'outsideWorktree\\0'
  exit 0
fi
physical_root=$(pwd -P)
repo_root=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$physical_root" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  printf 'notRepository\\0'
  exit 0
fi
repo_root=$(cd -- "$repo_root" && pwd -P)
head_oid=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" rev-parse --verify HEAD 2>/dev/null || true)
branch=$(GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
if [ "$repo_root" = "$physical_root" ]; then
  workspace_relative=
else
  case "$physical_root" in
    "$repo_root"/*) workspace_relative=\${physical_root#"$repo_root"/} ;;
    *) printf 'outsideWorktree\\0'; exit 0 ;;
  esac
fi
printf 'available\\0%s\\0%s\\0%s\\0%s\\0' "$repo_root" "$workspace_relative" "$head_oid" "$branch"
if [ -n "$workspace_relative" ]; then
  GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" status --porcelain=v2 -z --untracked-files=all -- "$workspace_relative"
else
  GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C "$repo_root" status --porcelain=v2 -z --untracked-files=all
fi
`;
  return remoteLoginShellCommand(
    `sh -c ${shellQuote(script)} sh ${shellQuote(projectPath)} ${shellQuote(rootPath)}`,
  );
}

function parseWorkspaceSnapshot(output: string): RemoteGitWorkspaceSnapshot {
  const fields = output.split("\0");
  const availability = fields[0];
  if (
    availability === "gitUnavailable" ||
    availability === "notRepository" ||
    availability === "outsideWorktree"
  ) {
    return { availability };
  }
  if (availability !== "available") {
    throw new Error("Remote Git workspace inspection returned an invalid capability state");
  }
  const repositoryRoot = fields[1];
  if (repositoryRoot === undefined || repositoryRoot === "") {
    throw new Error("Remote Git workspace inspection omitted the repository root");
  }
  const workspaceRelativePath = fields[2];
  if (workspaceRelativePath === undefined) {
    throw new Error("Remote Git workspace inspection omitted the workspace path");
  }
  const headOid = fields[3] === undefined || fields[3] === "" ? null : fields[3];
  const branch = fields[4] === undefined || fields[4] === "" ? null : fields[4];
  const files = parseGitStatusRecords(fields.slice(5)).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  if (files.length > MAX_GIT_WORKSPACE_FILES) {
    throw new Error(`Remote Git workspace contains more than ${MAX_GIT_WORKSPACE_FILES} changes`);
  }
  return {
    availability: "available",
    repositoryRoot,
    workspaceRelativePath,
    headOid,
    branch,
    files,
  };
}
