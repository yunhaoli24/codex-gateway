export const SUPPORTED_CODEX_VERSION = "0.142.5";

export interface ParsedCodexVersion {
  raw: string;
  version: string;
}

export function parseCodexVersion(output: string): ParsedCodexVersion | null {
  const raw = output.trim();
  const match = raw.match(
    /\b(?:codex-cli|codex_cli_rs|codex-tui|codex_app_server|codex_gateway|codex_gateway_probe|Codex Desktop)[ /](\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/i,
  );
  if (!match) {
    return null;
  }
  return {
    raw,
    version: match[1],
  };
}

export function compareSemver(left: string, right: string) {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
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

function semverParts(version: string) {
  const parsed = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!parsed) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
}
