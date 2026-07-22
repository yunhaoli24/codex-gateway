import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CodexRemotePlatform } from "./codex-platform";

const execFileAsync = promisify(execFile);
const NPM_COMMAND_TIMEOUT_MS = 10 * 60_000;
const ARTIFACT_IDLE_TTL_MS = 30_000;

export interface CodexArtifactBundle {
  cacheArchive: {
    localPath: string;
    fileName: string;
    size: number;
    sha512: string;
  };
  nodeArchive: NodeArtifact | null;
}

interface NodeArtifact {
  localPath: string;
  fileName: string;
  directoryName: string;
  version: string;
  sha256: string;
}

interface SharedBundle {
  promise: Promise<PreparedBundle>;
  users: number;
  cleanupTimer: NodeJS.Timeout | null;
}

interface PreparedBundle {
  directory: string;
  artifacts: CodexArtifactBundle;
}

export class CodexArtifactProvider {
  private readonly shared = new Map<string, SharedBundle>();

  async withArtifacts<T>(
    version: string,
    platform: CodexRemotePlatform,
    options: { includeNode: boolean },
    callback: (artifacts: CodexArtifactBundle) => Promise<T>,
  ) {
    const key = `${version}:${platform.packageName}:${options.includeNode}`;
    let entry = this.shared.get(key);
    if (!entry) {
      const promise = prepareBundle(version, platform, options).catch((error) => {
        this.shared.delete(key);
        throw error;
      });
      entry = { promise, users: 0, cleanupTimer: null };
      this.shared.set(key, entry);
    }
    if (entry.cleanupTimer) {
      clearTimeout(entry.cleanupTimer);
      entry.cleanupTimer = null;
    }
    entry.users += 1;
    try {
      const prepared = await entry.promise;
      return await callback(prepared.artifacts);
    } finally {
      entry.users -= 1;
      if (entry.users === 0) this.scheduleCleanup(key, entry);
    }
  }

  private scheduleCleanup(key: string, entry: SharedBundle) {
    entry.cleanupTimer = setTimeout(() => {
      if (entry.users || this.shared.get(key) !== entry) return;
      this.shared.delete(key);
      void entry.promise.then(({ directory }) =>
        rm(directory, { recursive: true, force: true }).catch(() => undefined),
      );
    }, ARTIFACT_IDLE_TTL_MS);
    entry.cleanupTimer.unref();
  }
}

async function prepareBundle(
  version: string,
  platform: CodexRemotePlatform,
  options: { includeNode: boolean },
): Promise<PreparedBundle> {
  const directory = await mkdtemp(join(tmpdir(), "codex-gateway-artifacts-"));
  const cacheDirectory = join(directory, "npm-cache");
  const archivePath = join(directory, "codex-npm-cache.tgz");
  try {
    const platformSpec = await readOfficialPlatformSpec(version, platform.packageName);
    // Platform builds are npm aliases of @openai/codex, not standalone package tarballs.
    // Shipping npm's own cache preserves that alias so the remote npm install owns the layout.
    await npm(["cache", "add", "--cache", cacheDirectory, `@openai/codex@${version}`]);
    await npm(["cache", "add", "--cache", cacheDirectory, platformSpec]);
    await run("tar", ["-czf", archivePath, "-C", cacheDirectory, "."]);
    const file = await stat(archivePath);
    const nodeArchive = options.includeNode ? await prepareNodeArtifact(directory, platform) : null;
    return {
      directory,
      artifacts: {
        cacheArchive: {
          localPath: archivePath,
          fileName: "codex-npm-cache.tgz",
          size: file.size,
          sha512: await hashFile(archivePath),
        },
        nodeArchive,
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function prepareNodeArtifact(
  directory: string,
  platform: CodexRemotePlatform,
): Promise<NodeArtifact> {
  const version = process.versions.node;
  const directoryName = `node-v${version}-${platform.nodeTarget}`;
  const fileName = `${directoryName}.tar.gz`;
  const releaseRoot = `https://nodejs.org/dist/v${version}`;
  const checksumsResponse = await fetch(`${releaseRoot}/SHASUMS256.txt`);
  if (!checksumsResponse.ok) {
    throw new Error(
      `Failed to download official Node.js checksums: HTTP ${checksumsResponse.status}`,
    );
  }
  const checksums = await checksumsResponse.text();
  const checksumLine = checksums.split("\n").find((line) => line.trim().endsWith(`  ${fileName}`));
  const sha256 = checksumLine?.trim().split(/\s+/, 1)[0];
  if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Official Node.js checksums do not contain ${fileName}`);
  }

  const response = await fetch(`${releaseRoot}/${fileName}`);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download official Node.js ${fileName}: HTTP ${response.status}`);
  }
  const localPath = join(directory, fileName);
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(localPath));
  const downloadedHash = await hashFile(localPath, "sha256");
  if (downloadedHash !== sha256) {
    throw new Error(`Official Node.js archive checksum mismatch for ${fileName}`);
  }
  return { localPath, fileName, directoryName, version, sha256 };
}

async function readOfficialPlatformSpec(version: string, packageName: string) {
  const { stdout } = await npm([
    "view",
    `@openai/codex@${version}`,
    "optionalDependencies",
    "--json",
  ]);
  let dependencies: Record<string, unknown>;
  try {
    dependencies = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error(`npm returned invalid optional dependency metadata for Codex ${version}`);
  }
  const alias = dependencies[packageName];
  if (typeof alias !== "string" || !alias.startsWith("npm:@openai/codex@")) {
    throw new Error(`Codex ${version} does not publish the official ${packageName} package alias`);
  }
  return alias.slice("npm:".length);
}

function npm(args: string[]) {
  return run("npm", args);
}

async function run(command: string, args: string[]) {
  return await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: NPM_COMMAND_TIMEOUT_MS,
  });
}

async function hashFile(path: string, algorithm = "sha512") {
  const hash = createHash(algorithm);
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
