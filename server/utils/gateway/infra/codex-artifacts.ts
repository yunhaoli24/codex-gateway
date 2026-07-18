import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CodexRemotePlatform } from "./codex-platform";

const execFileAsync = promisify(execFile);
const NPM_COMMAND_TIMEOUT_MS = 10 * 60_000;

export interface CodexArtifactBundle {
  cacheArchive: {
    localPath: string;
    fileName: string;
    size: number;
    sha512: string;
  };
}

interface SharedBundle {
  promise: Promise<PreparedBundle>;
  users: number;
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
    callback: (artifacts: CodexArtifactBundle) => Promise<T>,
  ) {
    const key = `${version}:${platform.packageName}`;
    let entry = this.shared.get(key);
    if (!entry) {
      entry = { promise: prepareBundle(version, platform), users: 0 };
      this.shared.set(key, entry);
    }
    entry.users += 1;

    try {
      const prepared = await entry.promise;
      return await callback(prepared.artifacts);
    } finally {
      entry.users -= 1;
      if (entry.users === 0 && this.shared.get(key) === entry) {
        this.shared.delete(key);
        const prepared = await entry.promise.catch(() => null);
        if (prepared) await rm(prepared.directory, { recursive: true, force: true });
      }
    }
  }
}

async function prepareBundle(
  version: string,
  platform: CodexRemotePlatform,
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
    return {
      directory,
      artifacts: {
        cacheArchive: {
          localPath: archivePath,
          fileName: "codex-npm-cache.tgz",
          size: file.size,
          sha512: await hashFile(archivePath),
        },
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
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

async function hashFile(path: string) {
  const hash = createHash("sha512");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
