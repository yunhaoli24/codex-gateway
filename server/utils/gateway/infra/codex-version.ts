export const SUPPORTED_CODEX_VERSION = "0.143.0";

export interface ParsedCodexVersion {
  raw: string;
  version: string;
}

export function parseCodexVersion(output: string): ParsedCodexVersion | null {
  const raw = output.trim();
  const match = raw.match(
    /\b(?:codex-cli|codex_cli_rs|codex-tui|codex_app_server|Codex Desktop)[ /](\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/i,
  );
  if (!match) {
    return null;
  }
  const version = match[1];
  if (!version) {
    return null;
  }
  return {
    raw,
    version,
  };
}

export function compareSemver(left: string, right: string) {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (const index of [0, 1, 2] as const) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function isCodexVersionAtLeast(version: string, minimum: string) {
  return compareSemver(version, minimum) >= 0;
}

function semverParts(version: string): [number, number, number] {
  const parsed = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!parsed) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  const [, major, minor, patch] = parsed;
  if (major == null || minor == null || patch == null) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return [Number(major), Number(minor), Number(patch)];
}
