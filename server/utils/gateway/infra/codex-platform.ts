export interface CodexRemotePlatform {
  platform: "darwin" | "linux";
  arch: "arm64" | "x64";
  packageName:
    | "@openai/codex-darwin-arm64"
    | "@openai/codex-darwin-x64"
    | "@openai/codex-linux-arm64"
    | "@openai/codex-linux-x64";
}

const PLATFORM_PACKAGES = {
  "darwin:arm64": "@openai/codex-darwin-arm64",
  "darwin:x64": "@openai/codex-darwin-x64",
  "linux:arm64": "@openai/codex-linux-arm64",
  "linux:x64": "@openai/codex-linux-x64",
} as const;

export function parseCodexRemotePlatform(output: string): CodexRemotePlatform {
  const [platform, arch] = output.trim().split(/\s+/, 2);
  const key = `${platform}:${arch}` as keyof typeof PLATFORM_PACKAGES;
  const packageName = PLATFORM_PACKAGES[key];
  if (!packageName) {
    throw new Error(
      `Unsupported remote Codex platform: ${platform || "unknown"}/${arch || "unknown"}`,
    );
  }
  return {
    platform: platform as CodexRemotePlatform["platform"],
    arch: arch as CodexRemotePlatform["arch"],
    packageName,
  };
}
