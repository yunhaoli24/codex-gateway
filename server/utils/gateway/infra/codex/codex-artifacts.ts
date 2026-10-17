import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CodexRemotePlatform } from "./codex-platform";
import { z } from "zod";
import { gatewayDatabasePath } from "../../storage/database";
import { gatewayLog } from "../../logging";

const ARTIFACT_IDLE_TTL_MS = 24 * 60 * 60_000;
const RELEASE_METADATA_TIMEOUT_MS = 30_000;
const RELEASE_ASSET_TIMEOUT_MS = 10 * 60_000;

export interface CodexArtifactBundle {
  releaseTarget: CodexRemotePlatform["releaseTarget"];
  standaloneArchive: {
    localPath: string;
    fileName: string;
    size: number;
    sha256: string;
  };
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

  async acquire(version: string, platform: CodexRemotePlatform) {
    const key = `${version}:${platform.releaseTarget}`;
    let entry = this.shared.get(key);
    if (entry === undefined) {
      const promise = prepareBundle(version, platform).catch((error) => {
        this.shared.delete(key);
        throw error;
      });
      entry = { promise, users: 0, cleanupTimer: null };
      this.shared.set(key, entry);
    }
    if (entry.cleanupTimer !== null) {
      clearTimeout(entry.cleanupTimer);
      entry.cleanupTimer = null;
    }
    entry.users += 1;
    try {
      const prepared = await entry.promise;
      return {
        artifacts: prepared.artifacts,
        release: () => {
          entry.users -= 1;
          if (entry.users === 0) this.scheduleCleanup(key, entry);
        },
      };
    } catch (error) {
      entry.users -= 1;
      if (entry.users === 0) this.scheduleCleanup(key, entry);
      throw error;
    }
  }

  private scheduleCleanup(key: string, entry: SharedBundle) {
    entry.cleanupTimer = setTimeout(() => {
      if (entry.users !== 0 || this.shared.get(key) !== entry) return;
      this.shared.delete(key);
      void entry.promise
        .then(({ directory }) => rm(directory, { recursive: true, force: true }))
        .catch(() => undefined);
    }, ARTIFACT_IDLE_TTL_MS);
    entry.cleanupTimer.unref();
  }
}

async function prepareBundle(
  version: string,
  platform: CodexRemotePlatform,
): Promise<PreparedBundle> {
  const release = await resolveStandaloneRelease(version, platform);
  // Use the existing data volume so a Gateway restart does not download the same 150 MB again.
  // The digest is the cache identity; verify disk contents before reusing bytes from a prior
  // process. Idle leases keep packages for a day, rather than evicting between SSH retries.
  const directory = join(
    dirname(gatewayDatabasePath()),
    "cache",
    "codex-artifacts",
    release.sha256,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archivePath = join(directory, release.assetName);
  try {
    const cachedFile = await stat(archivePath).catch(() => null);
    const cached =
      cachedFile !== null && (await hashFile(archivePath, "sha256")) === release.sha256;
    if (!cached) {
      // Only publish verified downloads. A killed process may leave .part, but never a cache hit.
      const partialPath = `${archivePath}.part`;
      await downloadVerifiedArchive(release, partialPath);
      await rename(partialPath, archivePath);
    }
    const file = await stat(archivePath);
    gatewayLog("info", "gateway-upgrade", cached ? "artifact cache hit" : "artifact downloaded", {
      targetVersion: version,
      releaseTarget: platform.releaseTarget,
      bytes: file.size,
    });
    return {
      directory,
      artifacts: {
        releaseTarget: platform.releaseTarget,
        standaloneArchive: {
          localPath: archivePath,
          fileName: release.assetName,
          size: file.size,
          sha256: release.sha256,
        },
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

interface StandaloneRelease {
  assetName: string;
  downloadUrls: string[];
  sha256: string;
}

interface ReleaseAsset {
  name: string;
  digest: string;
  url: string;
}

const releaseAssetSchema = z
  .object({
    name: z.string().min(1),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
    browser_download_url: z.url(),
  })
  .transform(({ name, digest, browser_download_url }) => ({
    name,
    digest,
    url: browser_download_url,
  }));

const releaseMetadataSchema = z.object({
  assets: z.array(releaseAssetSchema),
});

async function resolveStandaloneRelease(
  version: string,
  platform: CodexRemotePlatform,
): Promise<StandaloneRelease> {
  const assetName = `codex-package-${platform.releaseTarget}.tar.gz`;
  const releasesUrl = `https://releases.openai.com/codex/releases/${version}/release.json`;
  const githubUrl = `https://api.github.com/repos/openai/codex/releases/tags/rust-v${version}`;
  const metadataUrls = [releasesUrl, githubUrl];
  const assets: ReleaseAsset[] = [];
  const failures: string[] = [];

  for (const metadataUrl of metadataUrls) {
    try {
      assets.push(...(await readReleaseAssets(metadataUrl)));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const candidates = assets.filter((asset) => asset.name === assetName);
  if (candidates.length === 0) {
    throw new Error(
      [
        `Codex ${version} does not publish ${assetName}`,
        failures.length > 0 ? `Release metadata failures: ${failures.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  const sha256 = candidates[0]!.digest.slice("sha256:".length).toLowerCase();
  // releases.openai.com is preferred because the official installer uses it first. The GitHub
  // asset remains a verification-preserving fallback for temporarily unavailable infrastructure.
  return {
    assetName,
    downloadUrls: [...new Set(candidates.map(({ url }) => url))],
    sha256,
  };
}

async function readReleaseAssets(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(RELEASE_METADATA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return releaseMetadataSchema.parse(await response.json()).assets;
}

async function downloadVerifiedArchive(release: StandaloneRelease, outputPath: string) {
  const failures: string[] = [];
  for (const url of release.downloadUrls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(RELEASE_ASSET_TIMEOUT_MS),
      });
      if (!response.ok || response.body === null) {
        throw new Error(`HTTP ${response.status}`);
      }
      await pipeline(Readable.from(response.body), createWriteStream(outputPath));
      const actual = await hashFile(outputPath, "sha256");
      if (actual !== release.sha256) {
        throw new Error(`SHA-256 mismatch: expected ${release.sha256}, received ${actual}`);
      }
      return;
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      await rm(outputPath, { force: true });
    }
  }
  throw new Error(
    `Failed to download official Codex archive ${release.assetName}: ${failures.join("; ")}`,
  );
}

async function hashFile(path: string, algorithm: "sha256" | "sha512") {
  const hash = createHash(algorithm);
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
